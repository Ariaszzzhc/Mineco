/**
 * Subscription (OAuth) auth for Claude agents.
 *
 * mineco does NOT implement the Claude OAuth protocol — that would mean
 * impersonating the Claude Code client (ToS risk). Instead it delegates the
 * whole login to the **official** provisioned `claude` binary, exactly scoped to
 * one agent's isolated `CLAUDE_CONFIG_DIR`:
 *
 *   `CLAUDE_CONFIG_DIR=<agent dir> claude auth login --claudeai`
 *
 * The catch: `claude auth login` only uses the smooth **localhost-loopback**
 * browser flow (no code to paste) when its stdin is a real **TTY**. Spawned from
 * Electron with piped/no stdio it degrades to a manual "paste this code" flow.
 * So we launch it inside a REAL terminal window (a tiny per-platform script),
 * where it gets a TTY, opens the browser, captures the redirect on localhost,
 * and writes `.credentials.json` into the agent's config dir. The CLI then
 * owns refresh; mineco only reads status back from that file.
 *
 * Because each agent has its own config dir, several subscription accounts can
 * be logged in side-by-side as separate agents — they never collide.
 *
 * NOTE (macOS): Claude Code may store credentials in the login Keychain under a
 * single `Claude Code-credentials` item rather than per-config-dir, which can
 * break multi-account isolation on macOS. The file-based path (Windows/Linux)
 * isolates cleanly. Tracked as a known caveat.
 */

import { execFile as execFileCb, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SubscriptionStatus } from "@/shared/agent-protocol";
import { getConfigDir } from "./agent";
import { ensureClaudeCli } from "./cli-binary";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Login — launch the official CLI in a real terminal (TTY → loopback flow)
// ---------------------------------------------------------------------------

/** The `.credentials.json` OAuth entry the CLI writes after a successful login. */
interface ClaudeOAuthEntry {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  subscriptionType?: string;
}

/**
 * Opens a real terminal that runs `claude auth login --claudeai` for this
 * agent's config dir. Returns once the terminal has been launched — the user
 * completes the browser OAuth in that window; poll {@link subscriptionStatus}
 * afterwards to detect success.
 */
export async function loginSubscription(agentId: string): Promise<void> {
  const configDir = getConfigDir(agentId);
  await fs.mkdir(configDir, { recursive: true });
  const claudeBin = await ensureClaudeCli();
  await launchLoginTerminal(claudeBin, configDir);
}

/** Writes a throwaway launcher script and opens it in the OS terminal so the
 * login runs with a TTY. Returns after the terminal process has been spawned. */
async function launchLoginTerminal(
  claudeBin: string,
  configDir: string,
): Promise<void> {
  const tmp = path.join(os.tmpdir(), `mineco-login-${randomUUID()}`);

  if (process.platform === "win32") {
    const bat = `${tmp}.bat`;
    // A new console window (`start`) gives the CLI a real TTY. The script sets
    // the config dir, runs the official login, and pauses so the window — and
    // any error text — stays visible.
    await fs.writeFile(
      bat,
      [
        "@echo off",
        "title mineco - Claude subscription login",
        `set "CLAUDE_CONFIG_DIR=${configDir}"`,
        `"${claudeBin}" auth login --claudeai`,
        "echo.",
        "echo You can close this window once login succeeds.",
        "pause",
      ].join("\r\n"),
      "utf8",
    );
    // `start "" <bat>` opens the .bat in a fresh console window. The empty ""
    // is the (required) window-title placeholder so the path isn't consumed as
    // the title.
    spawnDetached("cmd.exe", ["/c", "start", "", bat]);
    return;
  }

  // POSIX: a small shell script the terminal runs.
  const sh = `${tmp}.sh`;
  await fs.writeFile(
    sh,
    [
      "#!/bin/sh",
      `export CLAUDE_CONFIG_DIR='${configDir.replace(/'/g, "'\\''")}'`,
      `'${claudeBin.replace(/'/g, "'\\''")}' auth login --claudeai`,
      'echo ""',
      'echo "You can close this window once login succeeds."',
      "read _ 2>/dev/null || true",
    ].join("\n"),
    { encoding: "utf8", mode: 0o755 },
  );

  if (process.platform === "darwin") {
    // Terminal.app runs the script in a new window (a TTY).
    const script = `tell application "Terminal"\n  activate\n  do script "sh ${sh.replace(/"/g, '\\"')}"\nend tell`;
    spawnDetached("osascript", ["-e", script]);
    return;
  }

  // Linux: try the common terminal emulators in turn.
  await launchLinuxTerminal(sh);
}

/** Tries known Linux terminal emulators until one launches the script. */
async function launchLinuxTerminal(scriptPath: string): Promise<void> {
  const candidates: Array<[string, string[]]> = [
    ["x-terminal-emulator", ["-e", "sh", scriptPath]],
    ["gnome-terminal", ["--", "sh", scriptPath]],
    ["konsole", ["-e", "sh", scriptPath]],
    ["xfce4-terminal", ["-e", `sh ${scriptPath}`]],
    ["xterm", ["-e", "sh", scriptPath]],
  ];
  for (const [cmd, args] of candidates) {
    if (await hasCommand(cmd)) {
      spawnDetached(cmd, args);
      return;
    }
  }
  throw new Error(
    "No terminal emulator found. Install one (e.g. gnome-terminal) or run " +
      `\`CLAUDE_CONFIG_DIR='…' claude auth login --claudeai\` manually.`,
  );
}

/** Whether `cmd` resolves on PATH (Linux terminal detection). */
async function hasCommand(cmd: string): Promise<boolean> {
  try {
    await execFile("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

/** Spawns a fully detached process so the terminal outlives this call. */
function spawnDetached(cmd: string, args: string[]): void {
  const child = spawn(cmd, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

// ---------------------------------------------------------------------------
// Status — read the OAuth credential the CLI wrote
// ---------------------------------------------------------------------------

/**
 * Reads the agent's subscription login state from `<configDir>/.credentials.json`
 * (the official CLI's credential store). Cheap and side-effect-free — no
 * subprocess — so the UI can poll it after a login window is opened.
 */
export async function subscriptionStatus(
  agentId: string,
): Promise<SubscriptionStatus> {
  const file = path.join(getConfigDir(agentId), ".credentials.json");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return { authenticated: false };
  }
  let entry: ClaudeOAuthEntry | undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    entry = (parsed.claudeAiOauth ?? parsed["claude.ai_oauth"]) as
      | ClaudeOAuthEntry
      | undefined;
  } catch {
    return { authenticated: false };
  }
  if (!entry?.accessToken) return { authenticated: false };
  return {
    authenticated: true,
    plan: entry.subscriptionType,
    expiresAt: entry.expiresAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Logout — drop the credential for this agent
// ---------------------------------------------------------------------------

/**
 * Logs the agent out: runs the official `claude auth logout` (non-interactive,
 * no TTY needed) scoped to the config dir, then removes the credential file as a
 * belt-and-suspenders fallback.
 */
export async function logoutSubscription(agentId: string): Promise<void> {
  const configDir = getConfigDir(agentId);
  try {
    const claudeBin = await ensureClaudeCli();
    await execFile(claudeBin, ["auth", "logout"], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    });
  } catch {
    /* fall through to the file removal below */
  }
  await fs
    .rm(path.join(configDir, ".credentials.json"), { force: true })
    .catch(() => {});
}
