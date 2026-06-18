/**
 * App settings service — reads and writes `~/.mineco/settings.json`.
 *
 * Stores appearance preferences and the per-scope disabled-server / disabled-skill
 * toggles. The full settings shape on disk is a superset of {@link AppSettings}:
 *
 * ```jsonc
 * {
 *   "theme": "dark",
 *   "accent": "#6366f1",
 *   "platform": "mac",
 *   "fontScale": 1,
 *   "lang": "en",
 *   "disabledMcpServers": ["server-name"],
 *   "disabledSkills": ["skill-name"]
 * }
 * ```
 *
 * `getAppearance` / `setAppearance` map to/from the renderer-facing
 * {@link AppSettings} type. All reads tolerate missing / corrupt JSON.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppSettings } from "@/shared/agent-protocol";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Full shape persisted to `~/.mineco/settings.json` (superset of AppSettings). */
export interface FullAppSettings extends AppSettings {
  disabledMcpServers: string[];
  disabledSkills: string[];
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function globalSettingsPath(): string {
  return path.join(os.homedir(), ".mineco", "settings.json");
}

/** Path to per-workspace settings — holds disabled toggles for that workspace. */
export function workspaceSettingsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".mineco", "settings.json");
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function defaultSettings(): FullAppSettings {
  return {
    theme: "dark",
    accent: "#6366f1",
    platform: process.platform === "win32" ? "win" : "mac",
    fontScale: 1,
    lang: "en",
    disabledMcpServers: [],
    disabledSkills: [],
  };
}

// ---------------------------------------------------------------------------
// Generic read / write helpers (tolerant)
// ---------------------------------------------------------------------------

/** Reads a settings JSON file; returns `{}` on any error. */
export async function readSettingsFile(
  filePath: string,
): Promise<Partial<FullAppSettings>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Partial<FullAppSettings>;
  } catch {
    return {};
  }
}

/** Writes a settings JSON file, creating parent dirs as needed. */
export async function writeSettingsFile(
  filePath: string,
  data: Partial<FullAppSettings>,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Global appearance API (renderer-facing)
// ---------------------------------------------------------------------------

/**
 * Reads the appearance slice of `~/.mineco/settings.json`.
 * Returns sensible defaults when the file is absent / corrupt.
 */
export async function getAppearance(): Promise<AppSettings> {
  const raw = await readSettingsFile(globalSettingsPath());
  const d = defaultSettings();
  return {
    theme: raw.theme ?? d.theme,
    accent: raw.accent ?? d.accent,
    platform: raw.platform ?? d.platform,
    fontScale: raw.fontScale ?? d.fontScale,
    lang: raw.lang ?? d.lang,
  };
}

/**
 * Merges the new appearance values into `~/.mineco/settings.json`, preserving
 * `disabledMcpServers` / `disabledSkills` and any other unknown keys.
 */
export async function setAppearance(settings: AppSettings): Promise<void> {
  const existing = await readSettingsFile(globalSettingsPath());
  const merged: Partial<FullAppSettings> = { ...existing, ...settings };
  await writeSettingsFile(globalSettingsPath(), merged);
}

// ---------------------------------------------------------------------------
// Disabled-toggle helpers (used by mcp.ts / skills.ts)
// ---------------------------------------------------------------------------

/** Returns the set of disabled server names from the given settings file. */
export async function getDisabledMcpServers(
  filePath: string,
): Promise<Set<string>> {
  const raw = await readSettingsFile(filePath);
  return new Set(raw.disabledMcpServers ?? []);
}

/** Returns the set of disabled skill names from the given settings file. */
export async function getDisabledSkills(
  filePath: string,
): Promise<Set<string>> {
  const raw = await readSettingsFile(filePath);
  return new Set(raw.disabledSkills ?? []);
}

/** Toggles a name in the `disabledMcpServers` list of the given settings file. */
export async function toggleMcpServer(
  filePath: string,
  name: string,
  enabled: boolean,
): Promise<void> {
  const raw = await readSettingsFile(filePath);
  const disabled = new Set(raw.disabledMcpServers ?? []);
  if (enabled) {
    disabled.delete(name);
  } else {
    disabled.add(name);
  }
  await writeSettingsFile(filePath, {
    ...raw,
    disabledMcpServers: [...disabled],
  });
}

/** Toggles a name in the `disabledSkills` list of the given settings file. */
export async function toggleSkill(
  filePath: string,
  name: string,
  enabled: boolean,
): Promise<void> {
  const raw = await readSettingsFile(filePath);
  const disabled = new Set(raw.disabledSkills ?? []);
  if (enabled) {
    disabled.delete(name);
  } else {
    disabled.add(name);
  }
  await writeSettingsFile(filePath, {
    ...raw,
    disabledSkills: [...disabled],
  });
}
