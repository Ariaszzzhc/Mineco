import { createStore, produce } from "solid-js/store";
import { api } from "../lib/api-client";
import type { Session } from "../lib/types";

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

function addSession(session: Session) {
  setState("sessions", [session, ...state.sessions]);
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

async function refreshCurrentSession() {
  if (!state.currentSession) return;
  const session = await api.getSession(state.currentSession.id);
  setState("currentSession", session);
  // Also update in the list
  const idx = state.sessions.findIndex((s) => s.id === session.id);
  if (idx !== -1) {
    setState("sessions", idx, session);
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
};
