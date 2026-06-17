import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import {
  type Agent,
  type AgentInput,
  type Appearance,
  CH,
  type McpServer,
  type MemoryEntry,
  type Skill,
  type TurnRunRequest,
  turnEventChannel,
  type Workspace,
} from "../src/lib/agent-protocol";
import { createAgent, deleteAgent, listAgents, updateAgent } from "./db/agents";
import { getAppearance, setAppearance } from "./db/app-settings";
import { createMcp, deleteMcp, listMcp, updateMcp } from "./db/mcp";
import {
  createMemory,
  deleteMemory,
  listMemory,
  updateMemory,
} from "./db/memory";
import { listMessages } from "./db/messages";
import { createSession, deleteSession, listSessions } from "./db/sessions";
import { createSkill, deleteSkill, listSkills, updateSkill } from "./db/skills";
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  updateWorkspace,
} from "./db/workspaces";
import { abortTurn, runTurn } from "./session-runner";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set by vite-plugin-electron during `vite` (dev). Absent in a packaged build.
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// `dist-electron/` is one level below the project root.
process.env.APP_ROOT = path.join(__dirname, "..");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      // Security baseline: the renderer gets no direct Node access; it can only
      // reach the surface explicitly exposed through the preload bridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

/** Registers the IPC surface: agent/workspace/session/memory/MCP/skill CRUD,
 * appearance, and the streaming turn runner. Engines run here, in the
 * Node-capable main process — never in the renderer. */
function registerIpc(): void {
  // Agents.
  ipcMain.handle(CH.agentsList, () => listAgents());
  ipcMain.handle(CH.agentsCreate, (_e, input: AgentInput) =>
    createAgent(input),
  );
  ipcMain.handle(CH.agentsUpdate, (_e, agent: Agent) => updateAgent(agent));
  ipcMain.handle(CH.agentsDelete, (_e, id: string) => deleteAgent(id));

  // Workspaces.
  ipcMain.handle(CH.workspacesList, () => listWorkspaces());
  ipcMain.handle(
    CH.workspacesCreate,
    (_e, input: { name: string; path: string }) => createWorkspace(input),
  );
  ipcMain.handle(CH.workspacesUpdate, (_e, ws: Workspace) =>
    updateWorkspace(ws),
  );
  ipcMain.handle(CH.workspacesDelete, (_e, id: string) => deleteWorkspace(id));
  ipcMain.handle(CH.workspacesPick, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // Sessions + canonical transcript.
  ipcMain.handle(CH.sessionsList, (_e, workspaceId?: string | null) =>
    listSessions(workspaceId),
  );
  ipcMain.handle(
    CH.sessionsCreate,
    (_e, input: { workspaceId: string | null; title?: string; cwd?: string }) =>
      createSession({
        workspaceId: input.workspaceId ?? null,
        title: input.title,
        // The sandboxed renderer can't resolve paths; default to the app root.
        cwd: input.cwd || process.env.APP_ROOT || process.cwd(),
      }),
  );
  ipcMain.handle(CH.sessionsDelete, (_e, id: string) => deleteSession(id));
  ipcMain.handle(CH.sessionMessages, (_e, sessionId: string) =>
    listMessages(sessionId),
  );

  // Workspace memory.
  ipcMain.handle(CH.memoryList, (_e, workspaceId: string) =>
    listMemory(workspaceId),
  );
  ipcMain.handle(
    CH.memoryCreate,
    (
      _e,
      input: { workspaceId: string; kind: MemoryEntry["kind"]; text: string },
    ) => createMemory(input),
  );
  ipcMain.handle(CH.memoryUpdate, (_e, entry: MemoryEntry) =>
    updateMemory(entry),
  );
  ipcMain.handle(CH.memoryDelete, (_e, id: string) => deleteMemory(id));

  // MCP servers.
  ipcMain.handle(CH.mcpList, () => listMcp());
  ipcMain.handle(
    CH.mcpCreate,
    (_e, input: Omit<McpServer, "id" | "createdAt">) => createMcp(input),
  );
  ipcMain.handle(CH.mcpUpdate, (_e, server: McpServer) => updateMcp(server));
  ipcMain.handle(CH.mcpDelete, (_e, id: string) => deleteMcp(id));

  // Skills.
  ipcMain.handle(CH.skillsList, () => listSkills());
  ipcMain.handle(
    CH.skillsCreate,
    (_e, input: Omit<Skill, "id" | "createdAt">) => createSkill(input),
  );
  ipcMain.handle(CH.skillsUpdate, (_e, skill: Skill) => updateSkill(skill));
  ipcMain.handle(CH.skillsDelete, (_e, id: string) => deleteSkill(id));

  // Appearance.
  ipcMain.handle(CH.appearanceGet, () => getAppearance());
  ipcMain.handle(CH.appearanceSet, (_e, appearance: Appearance) =>
    setAppearance(appearance),
  );

  // Streaming turn run: events go back on the request's private channel.
  ipcMain.on(CH.turnRun, (event, req: TurnRunRequest) => {
    const channel = turnEventChannel(req.id);
    void runTurn(req, (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
    });
  });
  ipcMain.on(CH.turnAbort, (_e, id: string) => abortTurn(id));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
