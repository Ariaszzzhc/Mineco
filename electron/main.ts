import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { app, BrowserWindow, ipcMain } from "electron";
import {
  AGENT_RUN_CHANNEL,
  type AgentEvent,
  type AgentRequest,
  agentEventChannel,
} from "../src/lib/agent-protocol";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set by vite-plugin-electron during `vite` (dev). Absent in a packaged build.
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

// `dist-electron/` is one level below the project root.
process.env.APP_ROOT = path.join(__dirname, "..");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 900,
    height: 720,
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

/**
 * Runs one agent turn and streams events back on the request's private channel.
 * The Agent SDK executes here, in the Node-capable main process — never in the
 * renderer.
 */
function handleAgentRun(event: Electron.IpcMainEvent, req: AgentRequest): void {
  const channel = agentEventChannel(req.id);
  const send = (payload: AgentEvent): void => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
  };

  void (async () => {
    try {
      for await (const message of query({
        prompt: req.prompt,
        options: {
          cwd: process.env.APP_ROOT,
          includePartialMessages: true,
          // Minimal read-only agent: no prompts, cannot modify the workspace.
          permissionMode: "bypassPermissions",
          allowedTools: ["Read", "Glob", "Grep"],
          // `env` replaces the subprocess environment wholesale (it is not
          // merged), so spread process.env to keep PATH / API keys / etc.
          env: {
            ...process.env,
            CLAUDE_CONFIG_DIR: "/Users/arias/.claude-glm",
          },
        },
      })) {
        switch (message.type) {
          case "stream_event": {
            const ev = message.event;
            if (
              ev.type === "content_block_delta" &&
              ev.delta.type === "text_delta"
            ) {
              send({ type: "text", text: ev.delta.text });
            }
            break;
          }
          case "assistant": {
            for (const block of message.message.content) {
              if (block.type === "tool_use") {
                send({ type: "tool", name: block.name });
              }
            }
            break;
          }
          case "result": {
            send({
              type: "done",
              result:
                message.subtype === "success"
                  ? message.result
                  : `Run ended: ${message.subtype}`,
            });
            break;
          }
        }
      }
    } catch (err) {
      send({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

app.whenReady().then(() => {
  ipcMain.on(AGENT_RUN_CHANNEL, handleAgentRun);
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
