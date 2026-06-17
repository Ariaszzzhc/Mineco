/**
 * ipc.ts — thin typed wrapper over window.mineco so views never touch
 * window.mineco directly. Also provides a runStateChanged subscription helper.
 *
 * The shape here mirrors electron/preload.ts exactly. If a method is absent
 * at runtime (older preload) the optional chaining returns undefined and the
 * caller should handle it gracefully.
 */

import type {
  Agent,
  AgentDetail,
  AgentInput,
  AppSettings,
  EngineCapabilities,
  EngineId,
  McpServerEntry,
  MemoryEntry,
  NormalizedEvent,
  SessionView,
  SkillEntry,
  TurnResponse,
  Workspace,
} from "./agent-protocol";

/** Scope levels accepted by MCP/skill write/create channels. */
type Scope = "global" | "project" | "local";

interface GlobalInstructions {
  text: string;
  updatedAt: number;
  tokenEstimate: number;
}

interface WorkspaceActivation {
  workspace: Workspace;
  sessionCount: number;
}

/** The full mineco bridge type (mirrors preload's MinecoApi). */
export interface MinecoApi {
  agents: {
    list(): Promise<Agent[]>;
    create(input: AgentInput): Promise<Agent>;
    update(id: string, input: AgentInput): Promise<Agent>;
    remove(id: string): Promise<void>;
    get(id: string): Promise<AgentDetail | null>;
    readSettings(id: string): Promise<string>;
    writeSettings(id: string, raw: string): Promise<void>;
  };
  globalInstructions: {
    read(): Promise<GlobalInstructions>;
    write(text: string): Promise<void>;
  };
  workspaces: {
    list(): Promise<Workspace[]>;
    create(input: {
      name: string;
      rootPath: string | null;
    }): Promise<Workspace>;
    update(input: {
      id: string;
      name: string;
      rootPath: string | null;
    }): Promise<void>;
    remove(id: string): Promise<void>;
    activate(id: string): Promise<WorkspaceActivation | null>;
    pickDirectory(): Promise<string | null>;
  };
  sessions: {
    list(workspaceId?: string | null): Promise<SessionView[]>;
    create(input: {
      workspaceId: string | null;
      agentId?: string | null;
      title?: string;
      cwd?: string;
    }): Promise<SessionView>;
    remove(id: string): Promise<void>;
    messages(sessionId: string): Promise<import("./agent-protocol").Message[]>;
  };
  memory: {
    list(workspaceId: string | null): Promise<MemoryEntry[]>;
    create(
      workspaceId: string | null,
      entry: Omit<MemoryEntry, "slug">,
    ): Promise<MemoryEntry>;
    update(workspaceId: string | null, entry: MemoryEntry): Promise<void>;
    remove(workspaceId: string | null, slug: string): Promise<void>;
  };
  mcp: {
    list(workspaceId: string | null): Promise<McpServerEntry[]>;
    writeScope(
      scope: Scope,
      workspaceId: string | null,
      entries: McpServerEntry[],
    ): Promise<void>;
    toggle(
      name: string,
      enabled: boolean,
      workspaceId: string | null,
    ): Promise<void>;
  };
  skills: {
    list(workspaceId: string | null): Promise<SkillEntry[]>;
    toggle(
      name: string,
      enabled: boolean,
      workspaceId: string | null,
    ): Promise<void>;
    create(
      name: string,
      scope: Scope,
      workspaceId: string | null,
    ): Promise<SkillEntry>;
  };
  appearance: {
    get(): Promise<AppSettings>;
    set(settings: AppSettings): Promise<void>;
  };
  capabilities(engine: EngineId): Promise<EngineCapabilities>;
  runTurn(
    req: {
      sessionId: string;
      agentId: string;
      model: string;
      mode: string;
      prompt: string;
    },
    onEvent: (event: NormalizedEvent) => void,
  ): { id: string; stop: () => void };
  respond(response: TurnResponse): void;
  onRunStateChanged(cb: (runningSessionIds: string[]) => void): () => void;
}

/** Returns the mineco bridge, cast to our typed interface. */
export function getApi(): MinecoApi {
  return (globalThis as unknown as { mineco: MinecoApi }).mineco;
}

/**
 * Subscribe to run-state broadcasts. `cb` fires with the full list of
 * currently-running session ids on every change. Returns an unsubscribe fn.
 * Safe to call before the bridge is available (no-ops).
 */
export function onRunStateChanged(
  cb: (runningSessionIds: string[]) => void,
): () => void {
  const api = (globalThis as unknown as { mineco?: MinecoApi }).mineco;
  if (!api?.onRunStateChanged) return () => {};
  return api.onRunStateChanged(cb);
}
