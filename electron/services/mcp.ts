/**
 * MCP server service (EDD §7, M2).
 *
 * Reads and writes the three-scope MCP config files:
 *   - Global:  `~/.mineco/mcp.json`
 *   - Project: `<workspaceRoot>/.mcp.json`
 *   - Local:   `<workspaceRoot>/.mcp.local.json` (gitignored)
 *
 * Format mirrors Claude Code's `.mcp.json`:
 * ```jsonc
 * { "mcpServers": { "<name>": { "type": "stdio"|"http", "command": "...", ... } } }
 * ```
 *
 * Disabled toggles live in `<scope-settings>.json` → `disabledMcpServers[]`,
 * NOT in the `.mcp.json` file itself (so the file stays shareable / git-clean).
 *
 * `listMcp(workspaceId)` merges all three scopes via `scope.ts` with the
 * disabled sets from the relevant settings files.
 *
 * `toEngineServers(entries)` converts the merged list to the shape the Claude
 * adapter expects as `EngineRunInput.mcpServers`.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServerEntry } from "../../src/lib/agent-protocol";
import {
  getDisabledMcpServers,
  globalSettingsPath,
  toggleMcpServer,
  workspaceSettingsPath,
} from "./app-settings";
import type { Scope } from "./scope";
import { resolveScoped } from "./scope";
import { getWorkspacePaths } from "./workspace-paths";

// ---------------------------------------------------------------------------
// Raw MCP file format (Claude Code compatible)
// ---------------------------------------------------------------------------

/** One server entry as stored in `.mcp.json` / `mcp.json`. */
interface RawMcpServer {
  /** Distinguishes `stdio` vs `http`. Defaults to `stdio` when absent. */
  type?: "stdio" | "http";
  /** stdio: the executable to run. http: the base URL. */
  command?: string;
  url?: string;
  args?: string[];
  env?: Record<string, string>;
  /** http headers (same key as env for http servers in Claude Code format). */
  headers?: Record<string, string>;
}

interface McpFile {
  mcpServers?: Record<string, RawMcpServer>;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function globalMcpPath(): string {
  return path.join(os.homedir(), ".mineco", "mcp.json");
}

function projectMcpPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".mcp.json");
}

function localMcpPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".mcp.local.json");
}

// ---------------------------------------------------------------------------
// Readers / writers
// ---------------------------------------------------------------------------

async function readMcpFile(filePath: string): Promise<McpFile> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as McpFile;
  } catch {
    return {};
  }
}

async function writeMcpFile(filePath: string, data: McpFile): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/** Converts the raw `.mcp.json` server map to an array of partial McpServerEntries
 * for a given scope. `enabled` and `overridden` are set later by `resolveScoped`. */
function rawToEntries(raw: McpFile, scope: Scope): McpServerEntry[] {
  const servers = raw.mcpServers ?? {};
  return Object.entries(servers).map(([name, s]) => {
    const isHttp = s.type === "http" || (!s.command && s.url !== undefined);
    return {
      name,
      scope,
      transport: isHttp ? "http" : "stdio",
      command: !isHttp ? (s.command ?? "") : undefined,
      args: !isHttp ? (s.args ?? []) : undefined,
      url: isHttp ? (s.url ?? s.command ?? "") : undefined,
      env: isHttp ? (s.headers ?? s.env ?? {}) : (s.env ?? {}),
      enabled: true, // will be overridden by resolveScoped
    } satisfies McpServerEntry;
  });
}

/** Converts an array of McpServerEntries back to the raw map format. */
function entriesToRaw(entries: McpServerEntry[]): McpFile {
  const mcpServers: Record<string, RawMcpServer> = {};
  for (const e of entries) {
    if (e.transport === "http") {
      mcpServers[e.name] = { type: "http", url: e.url, headers: e.env };
    } else {
      mcpServers[e.name] = {
        type: "stdio",
        command: e.command,
        ...(e.args?.length ? { args: e.args } : {}),
        ...(Object.keys(e.env).length ? { env: e.env } : {}),
      };
    }
  }
  return { mcpServers };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the merged, scoped MCP server list for a workspace (or the global
 * list when `workspaceId` is null / the workspace has no `rootPath`).
 *
 * The merge respects `disabledMcpServers` from the relevant settings files and
 * marks lower-priority shadows as `overridden`.
 */
export async function listMcp(
  workspaceId: string | null,
): Promise<McpServerEntry[]> {
  const { rootPath } = workspaceId
    ? await getWorkspacePaths(workspaceId)
    : { rootPath: null };

  // Always load global layer.
  const globalEntries = rawToEntries(
    await readMcpFile(globalMcpPath()),
    "global",
  );
  const globalDisabled = await getDisabledMcpServers(globalSettingsPath());

  // Project / local layers exist only when there is a workspace directory.
  let projectEntries: McpServerEntry[] = [];
  let localEntries: McpServerEntry[] = [];
  let workspaceDisabled: Set<string> = new Set();

  if (rootPath) {
    projectEntries = rawToEntries(
      await readMcpFile(projectMcpPath(rootPath)),
      "project",
    );
    localEntries = rawToEntries(
      await readMcpFile(localMcpPath(rootPath)),
      "local",
    );
    workspaceDisabled = await getDisabledMcpServers(
      workspaceSettingsPath(rootPath),
    );
  }

  const disabled = new Set([...globalDisabled, ...workspaceDisabled]);
  return resolveScoped(globalEntries, projectEntries, localEntries, disabled);
}

/**
 * Writes (replaces) the server list for a specific scope.
 *
 * - `scope === "global"` → writes `~/.mineco/mcp.json`
 * - `scope === "project"` → writes `<workspaceRoot>/.mcp.json`
 * - `scope === "local"` → writes `<workspaceRoot>/.mcp.local.json`
 */
export async function writeScope(
  scope: Scope,
  workspaceId: string | null,
  entries: McpServerEntry[],
): Promise<void> {
  if (scope === "global") {
    await writeMcpFile(globalMcpPath(), entriesToRaw(entries));
    return;
  }

  const { rootPath } = workspaceId
    ? await getWorkspacePaths(workspaceId)
    : { rootPath: null };
  if (!rootPath)
    throw new Error(
      "A workspace root path is required for project/local scope.",
    );

  const filePath =
    scope === "local" ? localMcpPath(rootPath) : projectMcpPath(rootPath);
  await writeMcpFile(filePath, entriesToRaw(entries));
}

/**
 * Toggles the enabled state of a named MCP server. Writes the `disabled` flag
 * into the appropriate settings file (NOT the `.mcp.json`).
 *
 * - `workspaceId === null` → global settings file.
 * - `workspaceId` provided → workspace-level settings file.
 */
export async function toggle(
  name: string,
  enabled: boolean,
  workspaceId: string | null,
): Promise<void> {
  if (!workspaceId) {
    await toggleMcpServer(globalSettingsPath(), name, enabled);
    return;
  }
  const { rootPath } = await getWorkspacePaths(workspaceId);
  const settingsFile = rootPath
    ? workspaceSettingsPath(rootPath)
    : globalSettingsPath();
  await toggleMcpServer(settingsFile, name, enabled);
}

/**
 * Converts the merged `McpServerEntry[]` to the shape the Claude adapter
 * consumes via `EngineRunInput.mcpServers` (only enabled, non-overridden servers).
 *
 * The adapter itself then maps this to `McpServerConfig` for the SDK — this
 * function just filters and normalises.
 */
export function toEngineServers(entries: McpServerEntry[]): McpServerEntry[] {
  return entries.filter((e) => e.enabled && !e.overridden);
}
