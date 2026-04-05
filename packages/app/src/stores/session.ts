import { createStore } from "solid-js/store";
import { api } from "../lib/api-client";
import type { SessionMessage } from "../lib/types";

type Session = Awaited<ReturnType<typeof api.getSession>>;

interface SessionState {
  sessions: Session[];
  currentSession: Session | null;
  loading: boolean;
}

const [state, setState] = createStore<SessionState>({
  sessions: [],
  currentSession: null,
  loading: false,
});

async function loadSessions(workspaceId?: string) {
  setState("loading", true);
  try {
    const sessions = await api.listSessions(workspaceId);
    setState("sessions", sessions);
  } finally {
    setState("loading", false);
  }
}

async function selectSession(id: string) {
  setState("loading", true);
  try {
    const session = await api.getSession(id);
    setState("currentSession", session);
  } catch {
    setState("currentSession", null);
  } finally {
    setState("loading", false);
  }
}

function addSession(session: Omit<Session, "running">) {
  setState("sessions", [{ ...session, running: false }, ...state.sessions]);
}

function removeSession(id: string) {
  setState(
    "sessions",
    state.sessions.filter((s) => s.id !== id),
  );
  if (state.currentSession?.id === id) {
    setState("currentSession", null);
  }
}

function refreshCurrentSession() {
  if (!state.currentSession) return Promise.resolve();
  return refreshSession(state.currentSession.id);
}

async function refreshSession(id: string) {
  const session = await api.getSession(id);
  const idx = state.sessions.findIndex((s) => s.id === id);
  if (idx !== -1) {
    setState("sessions", idx, session);
  }
  if (state.currentSession?.id === id) {
    setState("currentSession", session);
  }
}

function addMessageToSession(sessionId: string, message: SessionMessage) {
  const idx = state.sessions.findIndex((s) => s.id === sessionId);
  if (idx !== -1) {
    setState("sessions", idx, "messages", (prev) => [...prev, message]);
  }
  if (state.currentSession?.id === sessionId) {
    setState("currentSession", "messages", (prev) => [...prev, message]);
  }
}

function updateTitle(id: string, title: string) {
  const idx = state.sessions.findIndex((s) => s.id === id);
  if (idx !== -1) {
    setState("sessions", idx, "title", title);
  }
  if (state.currentSession?.id === id) {
    setState("currentSession", "title", title);
  }
}

export const sessionStore = {
  sessions: () => state.sessions,
  currentSession: () => state.currentSession,
  loading: () => state.loading,
  loadSessions,
  selectSession,
  addSession,
  removeSession,
  refreshCurrentSession,
  refreshSession,
  addMessageToSession,
  updateTitle,
};
