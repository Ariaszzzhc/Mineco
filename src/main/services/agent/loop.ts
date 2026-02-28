import { v4 as uuidv4 } from 'uuid';
import type {
  Session,
  Message,
  StreamEvent,
  ProviderConfig,
} from '../../shared/types';
import { AnthropicProvider } from '../provider/anthropic';
import { toolRegistry } from '../tools';
import type { BrowserWindow } from 'electron';

const SYSTEM_PROMPT = `You are Manong, an AI coding assistant. You help users with software engineering tasks including:

- Writing, reading, and modifying code
- Debugging and fixing issues
- Explaining code and concepts
- Running shell commands
- File system operations

Always be helpful, clear, and concise. When making file changes, prefer minimal targeted edits over full rewrites.

Current working directory: {{WORKING_DIR}}`;

export class AgentLoop {
  private provider: AnthropicProvider | null = null;
  private abortController: AbortController | null = null;

  constructor(private mainWindow: BrowserWindow) {}

  setProvider(config: ProviderConfig): void {
    this.provider = new AnthropicProvider(config);
  }

  async start(
    session: Session,
    userMessage: string,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    if (!this.provider) {
      onEvent({
        type: 'error',
        sessionId: session.id,
        messageId: '',
        error: 'No provider configured. Please set up your API key.',
      });
      return;
    }

    this.abortController = new AbortController();

    // Create user message
    const messageId = uuidv4();
    const userMsg: Message = {
      id: messageId,
      role: 'user',
      parts: [{ type: 'text', text: userMessage }],
      createdAt: Date.now(),
    };

    // Create assistant message
    const assistantMsgId = uuidv4();
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      parts: [],
      createdAt: Date.now(),
    };

    // Notify message start
    onEvent({
      type: 'message-start',
      sessionId: session.id,
      messageId: assistantMsgId,
    });

    try {
      // Add user message to session
      session.messages.push(userMsg);

      let currentText = '';
      const toolCalls: Array<{
        toolCallId: string;
        toolName: string;
        args: unknown;
      }> = [];

      // Stream response
      const systemPrompt = SYSTEM_PROMPT.replace(
        '{{WORKING_DIR}}',
        session.workingDir || 'not set'
      );
      const tools = toolRegistry.getAll();

      const stream = this.provider.stream(
        session.messages,
        tools,
        systemPrompt
      );

      for await (const event of stream) {
        if (this.abortController.signal.aborted) {
          break;
        }

        if (event.type === 'text-delta') {
          currentText += event.delta;
          // Update text part
          const existingTextPart = assistantMsg.parts.find(
            (p) => p.type === 'text'
          );
          if (existingTextPart && existingTextPart.type === 'text') {
            existingTextPart.text = currentText;
          } else {
            assistantMsg.parts.unshift({
              type: 'text',
              text: currentText,
            });
          }
          onEvent({
            type: 'text-delta',
            sessionId: session.id,
            messageId: assistantMsgId,
            delta: event.delta,
          });
        } else if (event.type === 'tool-call') {
          toolCalls.push({
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
          });

          // Add tool call part
          assistantMsg.parts.push({
            type: 'tool-call',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args as Record<string, unknown>,
          });

          onEvent({
            type: 'tool-call',
            sessionId: session.id,
            messageId: assistantMsgId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args as Record<string, unknown>,
          });
        }
      }

      // Execute tool calls
      if (toolCalls.length > 0 && session.workingDir) {
        for (const tc of toolCalls) {
          const tool = toolRegistry.get(tc.toolName);
          if (!tool) continue;

          try {
            const result = await tool.execute(tc.args as never, {
              workingDir: session.workingDir,
            });

            // Add tool result part
            assistantMsg.parts.push({
              type: 'tool-result',
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              result: result.output,
              isError: !result.success,
            });

            onEvent({
              type: 'tool-result',
              sessionId: session.id,
              messageId: assistantMsgId,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              result: result.output,
              isError: !result.success,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            assistantMsg.parts.push({
              type: 'tool-result',
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              result: errorMessage,
              isError: true,
            });

            onEvent({
              type: 'tool-result',
              sessionId: session.id,
              messageId: assistantMsgId,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              result: errorMessage,
              isError: true,
            });
          }
        }

        // If there were tool calls, continue the conversation
        session.messages.push(assistantMsg);
        await this.start(session, '', onEvent);
        return;
      }

      // Add assistant message to session
      session.messages.push(assistantMsg);

      // Notify message complete
      onEvent({
        type: 'message-complete',
        sessionId: session.id,
        messageId: assistantMsgId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onEvent({
        type: 'error',
        sessionId: session.id,
        messageId: assistantMsgId,
        error: errorMessage,
      });
    }
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
