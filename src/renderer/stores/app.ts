import { create } from 'zustand';
import type { Session, Message, Part, AppConfig, StreamEvent } from '../../shared/types';

interface AppState {
  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  currentSession: Session | null;

  // Streaming state
  isStreaming: boolean;
  pendingMessageId: string | null;
  pendingParts: Part[];

  // Config
  config: AppConfig | null;

  // Actions
  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (session: Session | null) => void;
  addSession: (session: Session) => void;
  updateSession: (session: Session) => void;
  deleteSession: (sessionId: string) => void;

  setConfig: (config: AppConfig) => void;

  // Streaming
  startStreaming: (messageId: string) => void;
  handleStreamEvent: (event: StreamEvent) => void;
  stopStreaming: () => void;

  // Messages
  addMessage: (sessionId: string, message: Message) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  currentSession: null,
  isStreaming: false,
  pendingMessageId: null,
  pendingParts: [],
  config: null,

  setSessions: (sessions) => set({ sessions }),

  setCurrentSession: (session) =>
    set({
      currentSession: session,
      currentSessionId: session?.id ?? null,
    }),

  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
      currentSession: session,
      currentSessionId: session.id,
    })),

  updateSession: (session) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === session.id ? session : s
      ),
      currentSession:
        state.currentSessionId === session.id ? session : state.currentSession,
    })),

  deleteSession: (sessionId) =>
    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== sessionId);
      const wasCurrent = state.currentSessionId === sessionId;
      return {
        sessions: newSessions,
        currentSession: wasCurrent ? newSessions[0] ?? null : state.currentSession,
        currentSessionId: wasCurrent ? newSessions[0]?.id ?? null : state.currentSessionId,
      };
    }),

  setConfig: (config) => set({ config }),

  startStreaming: (messageId) =>
    set({
      isStreaming: true,
      pendingMessageId: messageId,
      pendingParts: [],
    }),

  handleStreamEvent: (event) => {
    const state = get();

    if (event.type === 'text-delta') {
      // Update pending text part
      set((state) => {
        const parts = [...state.pendingParts];
        const textPartIdx = parts.findIndex((p) => p.type === 'text');
        if (textPartIdx >= 0) {
          const tp = parts[textPartIdx];
          if (tp.type === 'text') {
            parts[textPartIdx] = { ...tp, text: tp.text + event.delta };
          }
        } else {
          parts.unshift({ type: 'text', text: event.delta! });
        }
        return { pendingParts: parts };
      });
    } else if (event.type === 'tool-call') {
      set((state) => ({
        pendingParts: [
          ...state.pendingParts,
          {
            type: 'tool-call',
            toolCallId: event.toolCallId!,
            toolName: event.toolName!,
            args: event.args!,
          },
        ],
      }));
    } else if (event.type === 'tool-result') {
      set((state) => ({
        pendingParts: [
          ...state.pendingParts,
          {
            type: 'tool-result',
            toolCallId: event.toolCallId!,
            toolName: event.toolName!,
            result: event.result,
            isError: event.isError,
          },
        ],
      }));
    } else if (event.type === 'message-complete') {
      // Add pending message to session
      const session = state.currentSession;
      if (session && state.pendingMessageId) {
        const message: Message = {
          id: state.pendingMessageId,
          role: 'assistant',
          parts: state.pendingParts,
          createdAt: Date.now(),
        };

        // Auto-generate title from first user message
        let title = session.title;
        if (session.title === 'New Chat' && session.messages.length > 0) {
          const firstUserMsg = session.messages.find((m) => m.role === 'user');
          if (firstUserMsg) {
            const textPart = firstUserMsg.parts.find((p) => p.type === 'text');
            if (textPart && textPart.type === 'text') {
              // Generate title: first 30 chars, remove newlines
              title = textPart.text.replace(/\n/g, ' ').slice(0, 30).trim();
              if (textPart.text.length > 30) title += '...';
            }
          }
        }

        const updatedSession = {
          ...session,
          title,
          messages: [...session.messages, message],
          updatedAt: Date.now(),
        };

        // Persist to main process
        window.manong.session.update(updatedSession);

        set({
          isStreaming: false,
          pendingMessageId: null,
          pendingParts: [],
          currentSession: updatedSession,
          sessions: state.sessions.map((s) =>
            s.id === updatedSession.id ? updatedSession : s
          ),
        });
      }
    } else if (event.type === 'error') {
      set({
        isStreaming: false,
        pendingMessageId: null,
        pendingParts: [],
      });
    }
  },

  stopStreaming: () =>
    set({
      isStreaming: false,
      pendingMessageId: null,
      pendingParts: [],
    }),

  addMessage: (sessionId, message) =>
    set((state) => {
      const updatedSession = state.sessions.find((s) => s.id === sessionId);
      if (!updatedSession) return state;

      const newSession = {
        ...updatedSession,
        messages: [...updatedSession.messages, message],
        updatedAt: Date.now(),
      };

      return {
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? newSession : s
        ),
        currentSession:
          state.currentSessionId === sessionId ? newSession : state.currentSession,
      };
    }),
}));
