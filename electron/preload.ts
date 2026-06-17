import { contextBridge, ipcRenderer } from "electron";
import {
  type Agent,
  type AgentInput,
  type Appearance,
  CH,
  type EngineId,
  type McpServer,
  type MemoryEntry,
  type Message,
  type NormalizedEvent,
  RUN_MODES,
  type RunMode,
  type Session,
  type Skill,
  turnEventChannel,
  type Workspace,
} from "../src/lib/agent-protocol";

let counter = 0;

const mineco = {
  agents: {
    list: (): Promise<Agent[]> => ipcRenderer.invoke(CH.agentsList),
    create: (input: AgentInput): Promise<Agent> =>
      ipcRenderer.invoke(CH.agentsCreate, input),
    update: (agent: Agent): Promise<void> =>
      ipcRenderer.invoke(CH.agentsUpdate, agent),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(CH.agentsDelete, id),
  },

  workspaces: {
    list: (): Promise<Workspace[]> => ipcRenderer.invoke(CH.workspacesList),
    create: (input: { name: string; path: string }): Promise<Workspace> =>
      ipcRenderer.invoke(CH.workspacesCreate, input),
    update: (workspace: Workspace): Promise<void> =>
      ipcRenderer.invoke(CH.workspacesUpdate, workspace),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(CH.workspacesDelete, id),
    pickDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke(CH.workspacesPick),
  },

  sessions: {
    list: (workspaceId?: string | null): Promise<Session[]> =>
      ipcRenderer.invoke(CH.sessionsList, workspaceId),
    create: (input: {
      workspaceId: string | null;
      title?: string;
      cwd: string;
    }): Promise<Session> => ipcRenderer.invoke(CH.sessionsCreate, input),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(CH.sessionsDelete, id),
    messages: (sessionId: string): Promise<Message[]> =>
      ipcRenderer.invoke(CH.sessionMessages, sessionId),
  },

  memory: {
    list: (workspaceId: string): Promise<MemoryEntry[]> =>
      ipcRenderer.invoke(CH.memoryList, workspaceId),
    create: (input: {
      workspaceId: string;
      kind: MemoryEntry["kind"];
      text: string;
    }): Promise<MemoryEntry> => ipcRenderer.invoke(CH.memoryCreate, input),
    update: (entry: MemoryEntry): Promise<void> =>
      ipcRenderer.invoke(CH.memoryUpdate, entry),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(CH.memoryDelete, id),
  },

  mcp: {
    list: (): Promise<McpServer[]> => ipcRenderer.invoke(CH.mcpList),
    create: (input: Omit<McpServer, "id" | "createdAt">): Promise<McpServer> =>
      ipcRenderer.invoke(CH.mcpCreate, input),
    update: (server: McpServer): Promise<void> =>
      ipcRenderer.invoke(CH.mcpUpdate, server),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(CH.mcpDelete, id),
  },

  skills: {
    list: (): Promise<Skill[]> => ipcRenderer.invoke(CH.skillsList),
    create: (input: Omit<Skill, "id" | "createdAt">): Promise<Skill> =>
      ipcRenderer.invoke(CH.skillsCreate, input),
    update: (skill: Skill): Promise<void> =>
      ipcRenderer.invoke(CH.skillsUpdate, skill),
    remove: (id: string): Promise<void> =>
      ipcRenderer.invoke(CH.skillsDelete, id),
  },

  appearance: {
    get: (): Promise<Appearance> => ipcRenderer.invoke(CH.appearanceGet),
    set: (appearance: Appearance): Promise<void> =>
      ipcRenderer.invoke(CH.appearanceSet, appearance),
  },

  /** Static per-engine run modes (sync — no IPC round-trip). */
  runModes(engine: EngineId): RunMode[] {
    return RUN_MODES[engine] ?? [];
  },

  /**
   * Runs one turn. `onEvent` fires for each streamed event. Returns
   * `{ id, stop }`: call `stop()` to detach the listener and abort the run —
   * always call it when the run finishes or the component unmounts.
   */
  runTurn(
    req: {
      sessionId: string;
      agentId: string;
      model: string;
      mode: RunMode;
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
};

contextBridge.exposeInMainWorld("mineco", mineco);

export type MinecoApi = typeof mineco;
