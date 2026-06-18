import { contextBridge, ipcRenderer } from "electron";
import {
  type Agent,
  type AgentDetail,
  type AgentInput,
  type AppInfo,
  type AppSettings,
  CH,
  type EngineCapabilities,
  type EngineId,
  type McpServerEntry,
  type MemoryEntry,
  type Message,
  type NormalizedEvent,
  type NormalizedUsage,
  type SessionView,
  type SkillEntry,
  type SubscriptionStatus,
  type TurnResponse,
  turnEventChannel,
  type Workspace,
} from "@/shared/agent-protocol";

/** Scope levels accepted by MCP/skill write/create channels. */
type Scope = "global" | "project" | "local";

/** Global instructions payload (mirrors `services/global-instructions`). */
interface GlobalInstructions {
  text: string;
  updatedAt: number;
  tokenEstimate: number;
}

/** Workspace activation projection (mirrors `services/workspace`). */
interface WorkspaceActivation {
  workspace: Workspace;
  sessionCount: number;
}

let counter = 0;

const mineco = {
  // --- Agents (filesystem-backed) -----------------------------------------
  agents: {
    list: (): Promise<Agent[]> => ipcRenderer.invoke(CH.agentsList),
    create: (input: AgentInput): Promise<Agent> =>
      ipcRenderer.invoke(CH.agentsCreate, input),
    update: (id: string, input: AgentInput): Promise<Agent> =>
      ipcRenderer.invoke(CH.agentsUpdate, id, input),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(CH.agentsDelete, id),
    get: (id: string): Promise<AgentDetail | null> =>
      ipcRenderer.invoke(CH.agentsGet, id),
    readSettings: (id: string): Promise<string> =>
      ipcRenderer.invoke(CH.agentsReadSettings, id),
    writeSettings: (id: string, raw: string): Promise<void> =>
      ipcRenderer.invoke(CH.agentsWriteSettings, id, raw),
    /** Subscription (OAuth) auth, delegated to the official CLI. */
    auth: {
      /** Opens a terminal running `claude auth login --claudeai` for this agent. */
      login: (id: string): Promise<void> =>
        ipcRenderer.invoke(CH.agentsAuthLogin, id),
      /** Reads the agent's OAuth login status from its credentials file. */
      status: (id: string): Promise<SubscriptionStatus> =>
        ipcRenderer.invoke(CH.agentsAuthStatus, id),
      /** Logs the agent out (clears its OAuth credential). */
      logout: (id: string): Promise<void> =>
        ipcRenderer.invoke(CH.agentsAuthLogout, id),
    },
  },

  // --- Global instructions -------------------------------------------------
  globalInstructions: {
    read: (): Promise<GlobalInstructions> =>
      ipcRenderer.invoke(CH.globalInstructionsRead),
    write: (text: string): Promise<void> =>
      ipcRenderer.invoke(CH.globalInstructionsWrite, text),
  },

  // --- Workspaces ----------------------------------------------------------
  workspaces: {
    list: (): Promise<Workspace[]> => ipcRenderer.invoke(CH.workspacesList),
    create: (input: {
      name: string;
      rootPath: string | null;
    }): Promise<Workspace> => ipcRenderer.invoke(CH.workspacesCreate, input),
    update: (input: {
      id: string;
      name: string;
      rootPath: string | null;
    }): Promise<void> => ipcRenderer.invoke(CH.workspacesUpdate, input),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(CH.workspacesDelete, id),
    activate: (id: string): Promise<WorkspaceActivation | null> =>
      ipcRenderer.invoke(CH.workspacesActivate, id),
    pickDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke(CH.workspacesPick),
  },

  // --- Sessions ------------------------------------------------------------
  sessions: {
    list: (workspaceId?: string | null): Promise<SessionView[]> =>
      ipcRenderer.invoke(CH.sessionsList, workspaceId),
    create: (input: {
      workspaceId: string | null;
      agentId?: string | null;
      title?: string;
    }): Promise<SessionView> => ipcRenderer.invoke(CH.sessionsCreate, input),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(CH.sessionsDelete, id),
    messages: (sessionId: string): Promise<Message[]> =>
      ipcRenderer.invoke(CH.sessionMessages, sessionId),
    /** The most recent completed turn's usage, or null. */
    latestUsage: (sessionId: string): Promise<NormalizedUsage | null> =>
      ipcRenderer.invoke(CH.sessionLatestUsage, sessionId),
  },

  // --- Memory (filesystem-backed) -----------------------------------------
  memory: {
    list: (workspaceId: string | null): Promise<MemoryEntry[]> =>
      ipcRenderer.invoke(CH.memoryList, workspaceId),
    create: (
      workspaceId: string | null,
      entry: Omit<MemoryEntry, "slug">,
    ): Promise<MemoryEntry> =>
      ipcRenderer.invoke(CH.memoryCreate, workspaceId, entry),
    update: (workspaceId: string | null, entry: MemoryEntry): Promise<void> =>
      ipcRenderer.invoke(CH.memoryUpdate, workspaceId, entry),
    remove: (workspaceId: string | null, slug: string): Promise<void> =>
      ipcRenderer.invoke(CH.memoryDelete, workspaceId, slug),
  },

  // --- MCP (filesystem-backed) --------------------------------------------
  mcp: {
    list: (workspaceId: string | null): Promise<McpServerEntry[]> =>
      ipcRenderer.invoke(CH.mcpList, workspaceId),
    writeScope: (
      scope: Scope,
      workspaceId: string | null,
      entries: McpServerEntry[],
    ): Promise<void> =>
      ipcRenderer.invoke(CH.mcpWriteScope, scope, workspaceId, entries),
    toggle: (
      name: string,
      enabled: boolean,
      workspaceId: string | null,
    ): Promise<void> =>
      ipcRenderer.invoke(CH.mcpToggle, name, enabled, workspaceId),
  },

  // --- Skills (filesystem-backed) -----------------------------------------
  skills: {
    list: (workspaceId: string | null): Promise<SkillEntry[]> =>
      ipcRenderer.invoke(CH.skillsList, workspaceId),
    toggle: (
      name: string,
      enabled: boolean,
      workspaceId: string | null,
    ): Promise<void> =>
      ipcRenderer.invoke(CH.skillsToggle, name, enabled, workspaceId),
    create: (
      name: string,
      scope: Scope,
      workspaceId: string | null,
    ): Promise<SkillEntry> =>
      ipcRenderer.invoke(CH.skillsCreate, name, scope, workspaceId),
  },

  // --- Appearance ----------------------------------------------------------
  appearance: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(CH.appearanceGet),
    set: (settings: AppSettings): Promise<void> =>
      ipcRenderer.invoke(CH.appearanceSet, settings),
  },

  // --- App info (version + runtime) ---------------------------------------
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke(CH.appGetInfo),
  },

  /** Fetches an engine's static capability descriptor (run modes etc.). */
  capabilities: (engine: EngineId): Promise<EngineCapabilities> =>
    ipcRenderer.invoke(CH.enginesCapabilities, engine),

  /**
   * Runs one turn. `onEvent` fires for each streamed event. Returns
   * `{ id, stop }`: call `stop()` to detach the listener and abort the run —
   * always call it when the run finishes or the component unmounts. Answer
   * mid-turn `question` / `approval` events with {@link respond}, passing this
   * `id` as the `requestId`.
   */
  runTurn(
    req: {
      sessionId: string;
      agentId: string;
      model: string;
      mode: string;
      prompt: string;
    },
    onEvent: (event: NormalizedEvent) => void,
  ): { id: string; stop: () => void } {
    const id = `${Date.now()}-${counter++}`;
    const channel = turnEventChannel(id);

    const listener = (_e: unknown, payload: NormalizedEvent) => {
      onEvent(payload);
      if (payload.type === "result" || payload.type === "error") {
        ipcRenderer.removeListener(channel, listener);
      }
    };

    ipcRenderer.on(channel, listener);
    ipcRenderer.send(CH.turnRun, { id, ...req });

    return {
      id,
      stop: () => {
        ipcRenderer.removeListener(channel, listener);
        ipcRenderer.send(CH.turnAbort, id);
      },
    };
  },

  /** Answers a mid-turn question / approval request from the running turn. */
  respond(response: TurnResponse): void {
    ipcRenderer.send(CH.turnRespond, response);
  },

  /**
   * Subscribes to run-state broadcasts. `cb` receives the full list of
   * currently-running session ids on every change. Returns an unsubscribe fn.
   */
  onRunStateChanged(cb: (runningSessionIds: string[]) => void): () => void {
    const listener = (_e: unknown, ids: string[]) => cb(ids);
    ipcRenderer.on(CH.runStateChanged, listener);
    return () => ipcRenderer.removeListener(CH.runStateChanged, listener);
  },

  /**
   * Subscribes to agent-set changes (create / update / delete / settings write).
   * `cb` fires after the mutation has landed on disk, so a refetch reads fresh
   * data. Returns an unsubscribe fn.
   */
  onAgentsChanged(cb: () => void): () => void {
    const listener = () => cb();
    ipcRenderer.on(CH.agentsChanged, listener);
    return () => ipcRenderer.removeListener(CH.agentsChanged, listener);
  },
};

contextBridge.exposeInMainWorld("mineco", mineco);

export type MinecoApi = typeof mineco;
