/**
 * Workspace list + current selection. Loads from window.mineco.workspaces and
 * persists the selected workspace id locally so the app reopens where you left
 * off. `current` is derived from `items` + `currentId`.
 *
 * A workspace with an empty `path` is the shared scratch workspace.
 */

/** Matches the contract `Workspace` (backend owns the canonical type). */
export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

/**
 * Narrow view of the window.mineco.workspaces methods this store calls. The
 * backend agent owns the canonical MinecoApi; casting through this lets the
 * store compile before/after the backend lands `workspaces` on the bridge.
 */
interface WorkspaceBridge {
  workspaces?: {
    list?: () => Promise<Workspace[]>;
    create?: (input: { name: string; path: string }) => Promise<Workspace>;
    update?: (w: Workspace) => Promise<void> | void;
    remove?: (id: string) => Promise<void> | void;
    pickDirectory?: () => Promise<string | null>;
  };
}
function bridge(): WorkspaceBridge {
  return (globalThis as { mineco?: WorkspaceBridge }).mineco ?? {};
}

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
      const list = (await bridge().workspaces?.list?.()) ?? [];
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

  /** Create a workspace via the backend, append it, and select it. */
  async create(input: {
    name: string;
    path: string;
  }): Promise<Workspace | null> {
    const created = await bridge().workspaces?.create?.(input);
    if (!created) return null;
    items = [...items, created];
    this.setCurrent(created.id);
    return created;
  },

  /** Remove a workspace via the backend and prune local state. */
  async remove(id: string) {
    await bridge().workspaces?.remove?.(id);
    items = items.filter((w) => w.id !== id);
    if (currentId === id) this.setCurrent(null);
  },
};
