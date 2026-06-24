import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from "electron";
import {
  type AgentInput,
  type AppInfo,
  type AppSettings,
  CH,
  type EngineId,
  type McpServerEntry,
  type MemoryEntry,
  type SessionView,
  type TurnResponse,
  type TurnRunRequest,
  turnEventChannel,
  type UpdateState,
} from "@/shared/agent-protocol";
import { getEngine } from "./engines/registry";
import {
  createAgent,
  deleteAgent,
  getAgentDetail,
  listAgents,
  readAgentSettings,
  updateAgent,
  writeAgentSettings,
} from "./services/agent";
import { getAppearance, setAppearance } from "./services/app-settings";
import {
  closeAllSessions,
  closeSession as closeEngineSession,
} from "./services/engine-sessions";
import {
  readGlobalInstructions,
  writeGlobalInstructions,
} from "./services/global-instructions";
import { listMcp, toggle as toggleMcp, writeScope } from "./services/mcp";
import {
  createMemory,
  deleteMemory,
  listMemory,
  updateMemory,
} from "./services/memory";
import { isRunning } from "./services/run-registry";
import type { Scope } from "./services/scope";
import { createSkill, listSkills, toggleSkillEnabled } from "./services/skills";
import {
  loginSubscription,
  logoutSubscription,
  subscriptionStatus,
} from "./services/subscription-auth";
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  initUpdater,
  quitAndInstall,
} from "./services/updater";
import {
  activate,
  createWorkspace,
  deleteWorkspace,
  ensurePublicWorkspaceExists,
  listWorkspaces,
  resolveCwdFor,
  updateWorkspace,
} from "./services/workspace";
import {
  abortTurn,
  onRunStateChanged,
  resolveTurnResponse,
  runTurn,
} from "./session-runner";
import { bootstrap } from "./store/bootstrap";
import { listMessages } from "./store/messages";
import {
  createSession,
  deleteSession,
  getLastTurn,
  listSessions,
} from "./store/sessions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set by vite-plugin-electron during `vite` (dev). Absent in a packaged build.
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// `dist-electron/` is one level below the project root.
const APP_ROOT = path.join(__dirname, "..");
process.env.APP_ROOT = APP_ROOT;
const RENDERER_DIST = path.join(APP_ROOT, "dist");

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
// Closing the window hides it to the tray rather than quitting; only an
// explicit Quit (tray menu / before-quit) really exits. This flag flips the
// window `close` handler from "hide" to "let it close" for the real shutdown.
let isQuitting = false;

/** Brings the main window back: un-hides, restores from minimized, focuses.
 * Recreates the window if it was destroyed (shouldn't happen — we hide, not
 * close — but stays correct on macOS where windows can be gone). */
function showWindow(): void {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Creates the system-tray icon: double-click (or single-click) reopens the
 * window; the context menu offers Show / Quit. The icon reuses the app's brand
 * PNG (in dev it lives under `public/`, in a packaged build under `dist/`). */
function createTray(): void {
  if (tray) return;
  const iconPath = VITE_DEV_SERVER_URL
    ? path.join(APP_ROOT, "public", "brand", "mineco.png")
    : path.join(RENDERER_DIST, "brand", "mineco.png");
  const image = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 16, height: 16 });
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip("mineco");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show mineco", click: () => showWindow() },
      { type: "separator" },
      {
        label: "Quit mineco",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  // Windows fires double-click; clicking once is also a reasonable "reopen".
  tray.on("double-click", () => showWindow());
  tray.on("click", () => showWindow());
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1100,
    height: 800,
    title: "mineco",
    // Use the platform's native window controls, integrated into our own
    // titlebar region (the renderer no longer draws fake traffic lights /
    // min-max-close buttons). On macOS "hidden" keeps the native traffic
    // lights overlaid top-left with no separate title strip; on Windows/Linux
    // the native controls are overlaid at the right via titleBarOverlay.
    titleBarStyle: "hidden",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : { titleBarOverlay: { height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      // Security baseline: the renderer gets no direct Node access; it can only
      // reach the surface explicitly exposed through the preload bridge.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // External links — rendered Markdown <a> tags and any other navigation — must
  // open in the user's system browser, never navigate this renderer away from
  // the app. `target=_blank` links and `window.open` hit setWindowOpenHandler;
  // same-frame link clicks hit will-navigate. Either way we hand http(s)/mailto
  // to the OS and block in-app navigation.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (/^https?:|^mailto:/i.test(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Closing the window does not quit the app — it hides to the system tray, so
  // the warm engine sessions stay alive and reopening is instant. A real quit
  // (tray "Quit" / app.quit) sets `isQuitting` first so the window can close.
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win?.hide();
    }
  });

  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

/**
 * Merges a session list with the in-memory run registry to produce
 * {@link SessionView}s (the DB has no run-state column).
 */
async function listSessionViews(
  workspaceId?: string | null,
): Promise<SessionView[]> {
  const sessions = await listSessions(workspaceId);
  return sessions.map((s) => ({ ...s, running: isRunning(s.id) }));
}

/**
 * Registers the full IPC surface. Engines + filesystem services run here, in the
 * Node-capable main process — never in the renderer. Every channel maps to the
 * agent-protocol `CH` contract and delegates to a db/* or services/* function.
 */
function registerIpc(): void {
  // --- Agents (filesystem-backed) -----------------------------------------
  // Broadcast after a mutation lands so every window refreshes its cached agent
  // list (Composer model menu, Home picker). Fired post-write to avoid a
  // read-before-write race with the renderer's own refetch.
  const broadcastAgentsChanged = () => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.webContents.isDestroyed()) w.webContents.send(CH.agentsChanged);
    }
  };
  ipcMain.handle(CH.agentsList, () => listAgents());
  ipcMain.handle(CH.agentsCreate, async (_e, input: AgentInput) => {
    const agent = await createAgent(input);
    broadcastAgentsChanged();
    return agent;
  });
  ipcMain.handle(CH.agentsUpdate, async (_e, id: string, input: AgentInput) => {
    const agent = await updateAgent(id, input);
    broadcastAgentsChanged();
    return agent;
  });
  ipcMain.handle(CH.agentsDelete, async (_e, id: string) => {
    await deleteAgent(id);
    broadcastAgentsChanged();
  });
  ipcMain.handle(CH.agentsGet, (_e, id: string) => getAgentDetail(id));
  ipcMain.handle(CH.agentsReadSettings, (_e, id: string) =>
    readAgentSettings(id),
  );
  ipcMain.handle(
    CH.agentsWriteSettings,
    async (_e, id: string, raw: string) => {
      await writeAgentSettings(id, raw);
      broadcastAgentsChanged();
    },
  );
  // Subscription (OAuth) auth: launch the official CLI login in a terminal,
  // read its status back, and log out.
  ipcMain.handle(CH.agentsAuthLogin, (_e, id: string) => loginSubscription(id));
  ipcMain.handle(CH.agentsAuthStatus, (_e, id: string) =>
    subscriptionStatus(id),
  );
  ipcMain.handle(CH.agentsAuthLogout, (_e, id: string) =>
    logoutSubscription(id),
  );

  // --- Global instructions (~/.mineco/MINECO.md) --------------------------
  ipcMain.handle(CH.globalInstructionsRead, () => readGlobalInstructions());
  ipcMain.handle(CH.globalInstructionsWrite, (_e, text: string) =>
    writeGlobalInstructions(text),
  );

  // --- Workspaces ----------------------------------------------------------
  ipcMain.handle(CH.workspacesList, () => listWorkspaces());
  ipcMain.handle(
    CH.workspacesCreate,
    (_e, input: { name: string; rootPath: string | null }) =>
      createWorkspace(input),
  );
  ipcMain.handle(
    CH.workspacesUpdate,
    (_e, input: { id: string; name: string; rootPath: string | null }) =>
      updateWorkspace(input),
  );
  ipcMain.handle(CH.workspacesDelete, (_e, id: string) => deleteWorkspace(id));
  ipcMain.handle(CH.workspacesActivate, (_e, id: string) => activate(id));
  ipcMain.handle(CH.workspacesPick, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // --- Sessions + canonical transcript ------------------------------------
  ipcMain.handle(CH.sessionsList, (_e, workspaceId?: string | null) =>
    listSessionViews(workspaceId),
  );
  ipcMain.handle(
    CH.sessionsCreate,
    async (
      _e,
      input: {
        workspaceId: string | null;
        agentId?: string | null;
        title?: string;
      },
    ) =>
      createSession({
        workspaceId: input.workspaceId ?? null,
        agentId: input.agentId ?? null,
        title: input.title,
        // The sandboxed renderer can't resolve paths; the main process maps the
        // workspace id to a concrete cwd (real rootPath, or ~/.mineco/public for
        // the no-workspace case).
        cwd: await resolveCwdFor(input.workspaceId ?? null),
      }),
  );
  ipcMain.handle(CH.sessionsDelete, async (_e, id: string) => {
    // Tear down the live native query before dropping the transcript.
    await closeEngineSession(id);
    await deleteSession(id);
  });
  ipcMain.handle(CH.sessionMessages, (_e, sessionId: string) =>
    listMessages(sessionId),
  );
  // Latest completed turn's usage — seeds the composer context ring on reload.
  ipcMain.handle(CH.sessionLatestUsage, async (_e, sessionId: string) => {
    const last = await getLastTurn(sessionId);
    return last?.usage ?? null;
  });

  // --- Memory (filesystem-backed) -----------------------------------------
  ipcMain.handle(CH.memoryList, (_e, workspaceId: string | null) =>
    listMemory(workspaceId),
  );
  ipcMain.handle(
    CH.memoryCreate,
    (_e, workspaceId: string | null, entry: Omit<MemoryEntry, "slug">) =>
      createMemory(workspaceId, entry),
  );
  ipcMain.handle(
    CH.memoryUpdate,
    (_e, workspaceId: string | null, entry: MemoryEntry) =>
      updateMemory(workspaceId, entry),
  );
  ipcMain.handle(
    CH.memoryDelete,
    (_e, workspaceId: string | null, slug: string) =>
      deleteMemory(workspaceId, slug),
  );

  // --- MCP (filesystem-backed) --------------------------------------------
  ipcMain.handle(CH.mcpList, (_e, workspaceId: string | null) =>
    listMcp(workspaceId),
  );
  ipcMain.handle(
    CH.mcpWriteScope,
    (_e, scope: Scope, workspaceId: string | null, entries: McpServerEntry[]) =>
      writeScope(scope, workspaceId, entries),
  );
  ipcMain.handle(
    CH.mcpToggle,
    (_e, name: string, enabled: boolean, workspaceId: string | null) =>
      toggleMcp(name, enabled, workspaceId),
  );

  // --- Skills (filesystem-backed) -----------------------------------------
  ipcMain.handle(CH.skillsList, (_e, workspaceId: string | null) =>
    listSkills(workspaceId),
  );
  ipcMain.handle(
    CH.skillsToggle,
    (_e, name: string, enabled: boolean, workspaceId: string | null) =>
      toggleSkillEnabled(name, enabled, workspaceId),
  );
  ipcMain.handle(
    CH.skillsCreate,
    (_e, name: string, scope: Scope, workspaceId: string | null) =>
      createSkill(name, scope, workspaceId),
  );

  // --- Appearance / app settings ------------------------------------------
  ipcMain.handle(CH.appearanceGet, () => getAppearance());
  ipcMain.handle(CH.appearanceSet, (_e, settings: AppSettings) =>
    setAppearance(settings),
  );

  // --- Engine capabilities -------------------------------------------------
  ipcMain.handle(CH.enginesCapabilities, (_e, engine: EngineId) =>
    getEngine(engine).capabilities(),
  );

  // --- App info (version + runtime) ---------------------------------------
  ipcMain.handle(
    CH.appGetInfo,
    (): AppInfo => ({
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    }),
  );

  // --- Auto-update (electron-updater) -------------------------------------
  ipcMain.handle(CH.updatesGetState, () => getUpdateState());
  ipcMain.handle(CH.updatesCheck, () => checkForUpdates());
  ipcMain.handle(CH.updatesDownload, () => downloadUpdate());
  ipcMain.handle(CH.updatesInstall, () => {
    // The close-to-tray handler would otherwise veto the quit the installer
    // triggers; flip to a real shutdown first.
    isQuitting = true;
    quitAndInstall();
  });

  // --- Streaming turn run --------------------------------------------------
  // Events go back on the request's private channel; question/approval bridges
  // flow back in on `turnRespond`.
  ipcMain.on(CH.turnRun, (event, req: TurnRunRequest) => {
    const channel = turnEventChannel(req.id);
    void runTurn(req, (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
    });
  });
  ipcMain.on(CH.turnAbort, (_e, id: string) => abortTurn(id));
  ipcMain.on(CH.turnRespond, (_e, resp: TurnResponse) =>
    resolveTurnResponse(resp),
  );

  // Broadcast run-state changes so every window can refresh "running" badges.
  onRunStateChanged((runningSessionIds) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.webContents.isDestroyed()) {
        w.webContents.send(CH.runStateChanged, runningSessionIds);
      }
    }
  });
}

// Single-instance: only the first launch owns the app. A second launch fails
// the lock and quits immediately; the running instance is signalled via
// `second-instance`, where we surface the existing window instead of spawning
// a duplicate.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });

  app.whenReady().then(async () => {
    // One-shot 0.4 fresh-drop: rename any legacy mineco.db aside + sweep
    // orphaned native sessions (gated against live sessions — none yet at
    // launch), THEN ensure the public workspace exists in the file store.
    await bootstrap();
    await ensurePublicWorkspaceExists();
    registerIpc();
    createTray();
    createWindow();

    // Broadcast auto-update transitions to every window so the Settings card
    // reflects checking / available / downloading / downloaded / error live.
    initUpdater((state: UpdateState) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.webContents.isDestroyed()) {
          w.webContents.send(CH.updatesChanged, state);
        }
      }
    });
    // Check once at startup (no-op in dev). Manual re-checks come from the UI.
    void checkForUpdates();

    app.on("activate", () => {
      // Reopening from the dock (macOS) or after a hide should resurface the
      // existing window rather than create a second one.
      showWindow();
    });
  });
}

// The window hides to the tray on close, so it never fully closes during normal
// use. Override Electron's default "quit when all windows are closed" so the app
// stays resident in the tray; quitting goes exclusively through the tray menu
// (or `before-quit`), which sets `isQuitting`.
app.on("window-all-closed", () => {
  // Intentionally empty: stay alive in the tray.
});

// Tear down all warm native queries (and their subprocesses) on shutdown, and
// remember we're really quitting so the window `close` handler lets it close.
app.on("before-quit", () => {
  isQuitting = true;
  void closeAllSessions();
});
