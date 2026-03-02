import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './shared/ipc';
import type { Session, StreamEvent, AppConfig, Workspace, WorkspaceData, Skill, SkillExecuteResult, QuestionRequest, QuestionAnswer, Message } from './shared/types';
import type { MCPConfig, MCPServerStatus, LayeredMCPConfig } from './shared/mcp-types';
import type { AgentState, AgentMessage } from './shared/agent-types';

const api = {
  agent: {
    start: (
      sessionId: string,
      message: string,
      providerConfig: AppConfig['providers'][0] | undefined,
      workspacePath: string
    ) => {
      ipcRenderer.send(IPC_CHANNELS.AGENT_START, {
        sessionId,
        message,
        providerConfig,
        workspacePath,
      });
    },
    stop: () => {
      ipcRenderer.send(IPC_CHANNELS.AGENT_STOP);
    },
    onStream: (callback: (event: StreamEvent) => void) => {
      const handler = (_event: unknown, data: StreamEvent) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.AGENT_STREAM, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.AGENT_STREAM, handler);
      };
    },
  },

  workspace: {
    open: (): Promise<WorkspaceData | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_OPEN);
    },
    openPath: (path: string): Promise<WorkspaceData | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_OPEN_PATH, path);
    },
    getCurrent: (): Promise<WorkspaceData | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_CURRENT);
    },
    getRecent: (): Promise<Workspace[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_RECENT);
    },
    removeRecent: (path: string): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE_RECENT, path);
    },
  },

  session: {
    create: (): Promise<Session> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_CREATE);
    },
    list: (): Promise<Session[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_LIST);
    },
    get: (sessionId: string): Promise<Session | undefined> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET, sessionId);
    },
    delete: (sessionId: string): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_DELETE, sessionId);
    },
    update: (session: Session): Promise<Session> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SESSION_UPDATE, session);
    },
  },

  fs: {
    openFolder: (): Promise<string | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS.FS_OPEN_FOLDER);
    },
    readFile: (filePath: string): Promise<string> => {
      return ipcRenderer.invoke(IPC_CHANNELS.FS_READ_FILE, filePath);
    },
    writeFile: (filePath: string, content: string): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.FS_WRITE_FILE, filePath, content);
    },
    listDir: (
      dirPath: string
    ): Promise<Array<{ name: string; isDirectory: boolean }>> => {
      return ipcRenderer.invoke(IPC_CHANNELS.FS_LIST_DIR, dirPath);
    },
  },

  config: {
    get: (): Promise<AppConfig> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET);
    },
    set: (config: Partial<AppConfig>): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, config);
    },
  },

  window: {
    minimize: () => {
      ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE);
    },
    maximize: () => {
      ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE);
    },
    close: () => {
      ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE);
    },
  },

  skill: {
    list: (): Promise<Skill[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_LIST);
    },
    get: (name: string): Promise<Skill | undefined> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET, name);
    },
    execute: (name: string, args: string): Promise<SkillExecuteResult> => {
      return ipcRenderer.invoke(IPC_CHANNELS.SKILL_EXECUTE, name, args);
    },
  },

  question: {
    answer: (requestId: string, answers: QuestionAnswer[]): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.QUESTION_ANSWER, requestId, answers);
    },
    skip: (requestId: string): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.QUESTION_SKIP, requestId);
    },
    onAsk: (callback: (request: QuestionRequest) => void) => {
      const handler = (_event: unknown, request: QuestionRequest) => callback(request);
      ipcRenderer.on(IPC_CHANNELS.QUESTION_ASK, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.QUESTION_ASK, handler);
      };
    },
  },

  mcp: {
    getStatus: (): Promise<MCPServerStatus[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_STATUS);
    },
    connect: (name: string): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MCP_CONNECT, name);
    },
    disconnect: (name: string): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MCP_DISCONNECT, name);
    },
    getConfig: (): Promise<MCPConfig> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_CONFIG);
    },
    saveConfig: (config: MCPConfig): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MCP_SAVE_CONFIG, config);
    },
    getLayeredConfig: (): Promise<LayeredMCPConfig> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MCP_GET_LAYERED_CONFIG);
    },
    saveGlobalConfig: (config: MCPConfig): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MCP_SAVE_GLOBAL_CONFIG, config);
    },
    saveProjectConfig: (config: MCPConfig, workspacePath: string): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MCP_SAVE_PROJECT_CONFIG, config, workspacePath);
    },
    setWorkspace: (workspacePath: string | null): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.MCP_SET_WORKSPACE, workspacePath);
    },
    onStatusChanged: (callback: (statuses: MCPServerStatus[]) => void) => {
      const handler = (_event: unknown, statuses: MCPServerStatus[]) => callback(statuses);
      ipcRenderer.on(IPC_CHANNELS.MCP_STATUS_CHANGED, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MCP_STATUS_CHANGED, handler);
      };
    },
  },

  teammate: {
    spawn: (
      name: string,
      role: string,
      prompt: string,
      tools?: string[]
    ): Promise<AgentState> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TEAMMATE_SPAWN, {
        name,
        role,
        prompt,
        tools,
      });
    },
    sendMessage: (
      recipient: string,
      content: string,
      summary: string,
      type?: AgentMessage['type']
    ): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TEAMMATE_SEND_MESSAGE, {
        recipient,
        content,
        summary,
        type,
      });
    },
    readInbox: (): Promise<AgentMessage[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TEAMMATE_READ_INBOX);
    },
    getState: (teammateId: string): Promise<AgentState | undefined> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TEAMMATE_GET_STATE, teammateId);
    },
    getConversation: (teammateId: string): Promise<Message[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TEAMMATE_GET_CONVERSATION, teammateId);
    },
    list: (): Promise<AgentState[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TEAMMATE_LIST);
    },
    shutdown: (teammateId: string): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS.TEAMMATE_SHUTDOWN, teammateId);
    },
    onEvent: (callback: (event: { type: string; data: unknown }) => void) => {
      const handler = (_event: unknown, data: unknown) => callback(data as { type: string; data: unknown });
      ipcRenderer.on(IPC_CHANNELS.TEAMMATE_EVENT, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.TEAMMATE_EVENT, handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld('manong', api);

// Type declaration for renderer
export type ManongAPI = typeof api;
