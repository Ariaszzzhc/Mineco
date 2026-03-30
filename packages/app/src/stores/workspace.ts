import { createStore } from "solid-js/store";
import { api } from "../lib/api-client";
import type { Workspace } from "../lib/types";

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  loading: boolean;
}

const [state, setState] = createStore<WorkspaceState>({
  workspaces: [],
  currentWorkspace: null,
  loading: false,
});

async function loadWorkspaces() {
  setState("loading", true);
  try {
    const workspaces = await api.listWorkspaces();
    setState("workspaces", workspaces);
  } finally {
    setState("loading", false);
  }
}

async function selectWorkspace(id: string) {
  try {
    const workspace = await api.openWorkspace(id);
    setState("currentWorkspace", workspace);
  } catch {
    setState("currentWorkspace", null);
  }
}

async function createWorkspace(path: string): Promise<Workspace> {
  const workspace = await api.createWorkspace(path);
  setState("workspaces", [workspace, ...state.workspaces]);
  setState("currentWorkspace", workspace);
  return workspace;
}

function removeWorkspace(id: string) {
  setState(
    "workspaces",
    state.workspaces.filter((w) => w.id !== id),
  );
  if (state.currentWorkspace?.id === id) {
    setState("currentWorkspace", null);
  }
}

function clearCurrentWorkspace() {
  setState("currentWorkspace", null);
}

export const workspaceStore = {
  workspaces: () => state.workspaces,
  currentWorkspace: () => state.currentWorkspace,
  loading: () => state.loading,
  loadWorkspaces,
  selectWorkspace,
  createWorkspace,
  removeWorkspace,
  clearCurrentWorkspace,
};
