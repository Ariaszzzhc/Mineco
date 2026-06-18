/**
 * Workspace list + current selection. Loads from window.mineco.workspaces and
 * persists the selected workspace id locally so the app reopens where you left
 * off. `current` is derived from `items` + `currentId`.
 *
 * A workspace with rootPath === null is the shared/public workspace.
 *
 * Two-axis model (EDD §2.3): workspaces are DB-backed runtime state. Their
 * rootPath (if set) is the cwd for sessions + the scoping dir for MCP/skills/memory.
 */

import type { Workspace } from "@/shared/agent-protocol";

// Re-export for convenience so old imports still resolve.
export type { Workspace };

const STORAGE_KEY = "mineco.currentWorkspaceId";

let items = $state<Workspace[]>([]);
let currentId = $state<string | null>(readLocal());

function readLocal(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeLocal(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const current = $derived(
  currentId ? (items.find((w) => w.id === currentId) ?? null) : null,
);

function getApi() {
  return (
    globalThis as unknown as {
      mineco?: {
        workspaces?: {
          list?: () => Promise<Workspace[]>;
          create?: (input: {
            name: string;
            rootPath: string | null;
          }) => Promise<Workspace>;
          update?: (input: {
            id: string;
            name: string;
            rootPath: string | null;
          }) => Promise<void>;
          remove?: (id: string) => Promise<void>;
          activate?: (
            id: string,
          ) => Promise<{ workspace: Workspace; sessionCount: number } | null>;
          pickDirectory?: () => Promise<string | null>;
        };
      };
    }
  ).mineco?.workspaces;
}

export const workspaces = {
  get items() {
    return items;
  },
  get currentId() {
    return currentId;
  },
  get current(): Workspace | null {
    return current;
  },

  /** Load the workspace list from the backend. Reconciles the persisted
   * selection (drops it if the workspace no longer exists). */
  async load() {
    try {
      const list = (await getApi()?.list?.()) ?? [];
      items = list;
      if (currentId && !list.some((w) => w.id === currentId)) {
        currentId = null;
        writeLocal(null);
      }
    } catch {
      items = [];
    }
  },

  /** Select the active workspace (null = none / shared). Persists. */
  setCurrent(id: string | null) {
    currentId = id;
    writeLocal(id);
  },

  /**
   * Activate a workspace via the backend (persists lastMode/lastAgentId etc.)
   * and update local selection.
   */
  async activate(id: string) {
    try {
      const result = await getApi()?.activate?.(id);
      if (result) {
        // Merge updated workspace into items list.
        const idx = items.findIndex((w) => w.id === id);
        if (idx !== -1) {
          items[idx] = result.workspace;
        }
      }
    } catch {
      /* tolerate */
    }
    this.setCurrent(id);
  },

  /** Create a workspace via the backend, append it, and select it. */
  async create(input: {
    name: string;
    rootPath: string | null;
  }): Promise<Workspace | null> {
    try {
      const created = await getApi()?.create?.(input);
      if (!created) return null;
      items = [...items, created];
      this.setCurrent(created.id);
      return created;
    } catch {
      return null;
    }
  },

  /** Remove a workspace via the backend and prune local state. */
  async remove(id: string) {
    try {
      await getApi()?.remove?.(id);
    } catch {
      /* ignore */
    }
    items = items.filter((w) => w.id !== id);
    if (currentId === id) this.setCurrent(null);
  },

  /** Pick a directory via the native file dialog. */
  async pickDirectory(): Promise<string | null> {
    try {
      return (await getApi()?.pickDirectory?.()) ?? null;
    } catch {
      return null;
    }
  },
};
