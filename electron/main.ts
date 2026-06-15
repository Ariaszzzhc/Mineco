import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import {
  CH,
  type ProfileInput,
  type ProviderProfile,
  type TurnRunRequest,
  turnEventChannel,
} from "../src/lib/agent-protocol";
import { listMessages } from "./db/messages";
import {
  createProfile,
  deleteProfile,
  listProfiles,
  updateProfile,
} from "./db/profiles";
import { createSession, deleteSession, listSessions } from "./db/sessions";
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
    width: 980,
    height: 760,
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

/** Registers the IPC surface: provider/session CRUD plus the streaming turn
 * runner. Engines run here, in the Node-capable main process — never in the
 * renderer. */
function registerIpc(): void {
  // Provider profiles.
  ipcMain.handle(CH.profilesList, () => listProfiles());
  ipcMain.handle(CH.profilesCreate, (_e, input: ProfileInput) =>
    createProfile(input),
  );
  ipcMain.handle(CH.profilesUpdate, (_e, profile: ProviderProfile) =>
    updateProfile(profile),
  );
  ipcMain.handle(CH.profilesDelete, (_e, id: string) => deleteProfile(id));

  // Sessions + canonical transcript.
  ipcMain.handle(CH.sessionsList, () => listSessions());
  ipcMain.handle(
    CH.sessionsCreate,
    (_e, input: { title?: string; cwd?: string }) =>
      createSession({
        title: input.title,
        // The sandboxed renderer can't resolve paths; default to the app root.
        cwd: input.cwd || process.env.APP_ROOT || process.cwd(),
      }),
  );
  ipcMain.handle(CH.sessionsDelete, (_e, id: string) => deleteSession(id));
  ipcMain.handle(CH.sessionMessages, (_e, sessionId: string) =>
    listMessages(sessionId),
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
