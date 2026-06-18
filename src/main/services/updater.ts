// Auto-update service — wraps electron-updater's `autoUpdater` and projects its
// event stream onto the shared `UpdateState`. The renderer never touches
// electron-updater directly; it reads state + drives check/download/install
// through IPC, and the main process broadcasts every transition.
//
// Update flow is manual-but-guided: we set `autoDownload = false` so a user
// opts into the download (and sees progress), then `quitAndInstall` swaps the
// app on the next quit. The feed/provider is baked into `app-update.yml` by
// electron-builder (see the `publish` block in electron-builder.yml).

import { app } from "electron";
// electron-updater is CommonJS; under ESM the named exports aren't reliably
// hoisted, so pull `autoUpdater` off the default export.
import electronUpdater from "electron-updater";
import type { UpdateState } from "@/shared/agent-protocol";

const { autoUpdater } = electronUpdater;

type Broadcast = (state: UpdateState) => void;

let broadcast: Broadcast = () => {};

// In dev there's no packaged `app-update.yml`, so checking would throw —
// surface the build as un-updatable instead of erroring on every check.
const supported = app.isPackaged;

let state: UpdateState = {
  status: "idle",
  currentVersion: app.getVersion(),
  supported,
};

/** Patches the current state and fans it out to the renderer. */
function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch };
  broadcast(state);
}

export function getUpdateState(): UpdateState {
  return state;
}

/**
 * Wires the autoUpdater event stream once at startup. `onChange` is the
 * renderer broadcast (every window gets the new state).
 */
export function initUpdater(onChange: Broadcast): void {
  broadcast = onChange;
  if (!supported) return;

  // We download on explicit user request; quitting installs whatever was
  // downloaded so a self-update lands even if the user never clicks "restart".
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => setState({ status: "checking" }));
  autoUpdater.on("update-available", (info) =>
    setState({
      status: "available",
      newVersion: info.version,
      error: undefined,
    }),
  );
  autoUpdater.on("update-not-available", () =>
    setState({ status: "not-available", newVersion: undefined }),
  );
  autoUpdater.on("download-progress", (p) =>
    setState({ status: "downloading", percent: Math.round(p.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    setState({ status: "downloaded", newVersion: info.version, percent: 100 }),
  );
  autoUpdater.on("error", (err) =>
    setState({ status: "error", error: err?.message ?? String(err) }),
  );
}

/**
 * Checks the feed for a newer version. Errors surface via the `error` event
 * (and reject the promise), so swallow the rejection here to avoid an unhandled
 * rejection — the state already reflects it.
 */
export async function checkForUpdates(): Promise<UpdateState> {
  if (!supported) return state;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // handled by the 'error' listener
  }
  return state;
}

/** Downloads the pending update (only meaningful after `update-available`). */
export async function downloadUpdate(): Promise<UpdateState> {
  if (!supported) return state;
  if (state.status !== "available" && state.status !== "error") return state;
  setState({ status: "downloading", percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
  } catch {
    // handled by the 'error' listener
  }
  return state;
}

/**
 * Quits and installs the downloaded update. The caller must first flip the
 * window's "really quitting" flag, otherwise the close-to-tray handler would
 * cancel the quit and the install never runs.
 */
export function quitAndInstall(): void {
  if (!supported || state.status !== "downloaded") return;
  // isSilent=false (show the installer where applicable), forceRunAfter=true.
  autoUpdater.quitAndInstall(false, true);
}
