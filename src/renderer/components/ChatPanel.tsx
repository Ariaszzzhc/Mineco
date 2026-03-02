import React, { useRef, useEffect, useState } from 'react';
import { PlusCircle, Image, Terminal, ArrowUp, Bot, X } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { MessageItem } from './MessageItem';
import { QuestionCard } from './QuestionCard';
import type { Message, QuestionAnswer } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';

const SLASH_COMMAND_PATTERN = /^\/(\w+)(?:\s+(.*))?$/;

export const ChatPanel: React.FC = () => {
  const {
    currentSession,
    currentWorkspace,
    isStreaming,
    pendingMessageId,
    pendingParts,
    pendingQuestion,
    config,
    skills,
    activeAgentId,
    teammates,
    teammateConversations,
    updateSession,
    startStreaming,
    handleStreamEvent,
    loadSkills,
    setPendingQuestion,
    setActiveAgent,
    loadTeammateConversation,
  } = useAppStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const rafRef = useRef<number>();

  // Find active teammate
  const activeTeammate = activeAgentId
    ? teammates.find((t) => t.id === activeAgentId)
    : null;

  // Get conversation for active teammate
  const teammateConversation = activeAgentId
    ? teammateConversations[activeAgentId] || []
    : [];

  // Load conversation when teammate is selected
  useEffect(() => {
    if (activeAgentId) {
      loadTeammateConversation(activeAgentId);
    }
  }, [activeAgentId, loadTeammateConversation]);

  // Listen for conversation updates
  useEffect(() => {
    const unsubscribe = window.manong.teammate.onEvent((event) => {
      if (event.type === 'conversation_updated' && activeAgentId === (event.data as { id: string }).id) {
        loadTeammateConversation(activeAgentId);
      }
    });
    return unsubscribe;
  }, [activeAgentId, loadTeammateConversation]);

  useEffect(() => {
    // Use requestAnimationFrame to throttle scroll calls
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      if (shouldAutoScrollRef.current && messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
      }
    });

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [currentSession?.messages, pendingParts]);

  useEffect(() => {
    const unsubscribe = window.manong.agent.onStream((event) => {
      handleStreamEvent(event);
    });
    return unsubscribe;
  }, [handleStreamEvent]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills, currentWorkspace]);

  useEffect(() => {
    const unsubscribe = window.manong.question.onAsk((request) => {
      setPendingQuestion(request);
    });
    return unsubscribe;
  }, [setPendingQuestion]);

  const handleQuestionSubmit = async (answers: QuestionAnswer[]) => {
    if (!pendingQuestion) return;

    await window.manong.question.answer(pendingQuestion.id, answers);

    // Add user's answer as a message
    if (currentSession) {
      const answerText = pendingQuestion.questions.map((q, idx) => {
        return `**${q.header}**: ${answers[idx].join(', ')}`;
      }).join('\n');

      const userMessage: Message = {
        id: uuidv4(),
        role: 'user',
        parts: [{ type: 'text', text: answerText }],
        createdAt: Date.now(),
      };

      const updatedSession = {
        ...currentSession,
        messages: [...currentSession.messages, userMessage],
        updatedAt: Date.now(),
      };
      updateSession(updatedSession);
    }

    setPendingQuestion(null);
  };

  const handleQuestionSkip = async () => {
    if (!pendingQuestion) return;

    await window.manong.question.skip(pendingQuestion.id);
    setPendingQuestion(null);
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !currentSession || !currentWorkspace) return;

    const trimmedInput = input.trim();
    const slashMatch = trimmedInput.match(SLASH_COMMAND_PATTERN);

    if (slashMatch) {
      const [, skillName, args = ''] = slashMatch;
      const skill = skills.find(s => s.name === skillName);

      if (skill) {
        const result = await window.manong.skill.execute(skillName, args);

        if (result.success && result.prompt) {
          const userMessage: Message = {
            id: uuidv4(),
            role: 'user',
            parts: [{ type: 'text', text: `/${skillName}${args ? ' ' + args : ''}` }],
            createdAt: Date.now(),
          };

          const updatedSession = {
            ...currentSession,
            messages: [...currentSession.messages, userMessage],
            updatedAt: Date.now(),
          };
          updateSession(updatedSession);

          const providerConfig = config?.providers.find(
            (p) => p.name === config.defaultProvider
          );

          const messageId = uuidv4();
          startStreaming(messageId);

          window.manong.agent.start(
            currentSession.id,
            result.prompt,
            providerConfig,
            currentWorkspace.path
          );

          setInput('');
          return;
        }
      }
    }

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      parts: [{ type: 'text', text: trimmedInput }],
      createdAt: Date.now(),
    };

    const updatedSession = {
      ...currentSession,
      messages: [...currentSession.messages, userMessage],
      updatedAt: Date.now(),
    };
    updateSession(updatedSession);

    const providerConfig = config?.providers.find(
      (p) => p.name === config.defaultProvider
    );

    const messageId = uuidv4();
    startStreaming(messageId);

    window.manong.agent.start(
      currentSession.id,
      trimmedInput,
      providerConfig,
      currentWorkspace.path
    );

    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!currentSession) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background text-text-secondary">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-text-primary mb-4">No Session</h2>
          <p className="mb-4 text-sm">Select a session or create a new one</p>
          <button
            onClick={async () => {
              const session = await window.manong.session.create();
              useAppStore.getState().addSession(session);
            }}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded transition-colors text-sm"
          >
            New Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col bg-background">
      {/* Agent Header - shows when viewing a teammate */}
      {activeAgentId && activeTeammate && (
        <div className="border-b border-border bg-surface px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-primary" />
            <span className="font-medium text-sm">{activeTeammate.name}</span>
            <span className="text-xs text-text-secondary">{activeTeammate.role}</span>
            <span className={`ml-2 px-2 py-0.5 rounded text-[10px] ${
              activeTeammate.status === 'running' ? 'bg-green-500/20 text-green-500' :
              activeTeammate.status === 'idle' ? 'bg-yellow-500/20 text-yellow-500' :
              activeTeammate.status === 'waiting' ? 'bg-blue-500/20 text-blue-500' :
              'bg-gray-500/20 text-gray-500'
            }`}>
              {activeTeammate.status}
            </span>
          </div>
          <button
            onClick={() => setActiveAgent(null)}
            className="text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded hover:bg-hover flex items-center gap-1"
          >
            <X size={12} />
            Back to Lead
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {activeAgentId && activeTeammate ? (
          // Show teammate's conversation history
          <div className="p-4">
            {teammateConversation.length === 0 ? (
              <div className="text-center text-text-secondary py-8">
                <Bot size={48} className="mx-auto mb-4 text-text-secondary/30" strokeWidth={1} />
                <p className="text-sm">No conversation history yet</p>
                <p className="text-xs mt-1">
                  {activeTeammate.hasHistory
                    ? 'Loading conversation...'
                    : `${activeTeammate.name} hasn't processed any tasks yet.`}
                </p>
              </div>
            ) : (
              <>
                {teammateConversation.map((message) => (
                  <MessageItem key={message.id} message={message} />
                ))}
              </>
            )}
          </div>
        ) : (
          <>
            {currentSession.messages.map((message) => (
              <MessageItem key={message.id} message={message} />
            ))}

            {/* Streaming message */}
            {isStreaming && pendingMessageId && (
              <MessageItem
                message={{
                  id: pendingMessageId,
                  role: 'assistant',
                  parts: pendingParts,
                  createdAt: Date.now(),
                }}
                isStreaming
                pendingParts={pendingParts}
              />
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4">
        <div className="max-w-3xl mx-auto">
          {activeAgentId && activeTeammate ? (
            // Read-only view for teammate conversations
            <div className="text-center text-text-secondary text-xs py-2">
              <p>Viewing conversation history of {activeTeammate.name}</p>
              <p className="text-[10px] mt-1">Messages are sent via Team-lead using send_message tool</p>
            </div>
          ) : pendingQuestion ? (
            <QuestionCard
              questions={pendingQuestion.questions}
              onSubmit={handleQuestionSubmit}
              onSkip={handleQuestionSkip}
            />
          ) : (
            <>
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a command or ask a question..."
                  className="w-full bg-surface text-text-primary rounded-lg px-4 py-3 pr-12 resize-none focus:outline-none focus:ring-1 focus:ring-primary border border-border disabled:opacity-50"
                  rows={1}
                  disabled={isStreaming}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming}
                  className="absolute right-2 bottom-2 p-2 text-text-secondary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Send message"
                >
                  <ArrowUp size={20} strokeWidth={1.5} />
                </button>
              </div>

              {/* Bottom toolbar */}
              <div className="flex items-center justify-between pt-2 mt-1">
                {/* Left buttons */}
                <div className="flex items-center gap-4">
                  <button
                    className="text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 text-xs font-mono group"
                    title="Add Context"
                  >
                    <PlusCircle size={16} className="group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                    <span>Context</span>
                  </button>
                  <button
                    className="text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 text-xs font-mono group"
                    title="Upload Image"
                  >
                    <Image size={16} className="group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                  </button>
                  <button
                    className="text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 text-xs font-mono group"
                    title="Terminal Command"
                  >
                    <Terminal size={16} className="group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                  </button>
                </div>

                {/* Right: hint */}
                <span className="text-[10px] text-text-secondary font-mono">
                  CTRL + ENTER
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
};
