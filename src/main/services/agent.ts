/**
 * Agent directory service (EDD §4.3 / §5.2).
 *
 * An Agent is an isolated directory at `~/.mineco/engines/claude/<id>/` that
 * serves as the `CLAUDE_CONFIG_DIR` for the Claude Agent SDK. The directory
 * holds two mineco-owned files:
 *   - `agent.json`    — display manifest (id / name / engine / defaultModel / createdAt)
 *   - `settings.json` — Claude-native settings (env with token/baseURL/model aliases;
 *                        permissions; hooks; etc.)
 *
 * Agents are NEVER stored in the runtime store. That store only holds runtime
 * state (sessions / messages / workspace pointers). All Agent identity and
 * connection info lives here on the filesystem.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  Agent,
  AgentDetail,
  AgentInput,
  AuthMode,
  EngineId,
} from "@/shared/agent-protocol";
import {
  applyConnectionToEnv,
  connectionEnvKeys,
  envToConnection,
} from "@/shared/agent-protocol";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** The shape written to / read from `agent.json`. `authMode` is optional for
 * back-compat: agents whose manifest predates it are treated as `api`. */
interface AgentManifest {
  id: string;
  name: string;
  engine: EngineId;
  authMode?: AuthMode;
  defaultModel: string;
  createdAt: number;
}

/** The subset of `settings.json` that mineco writes / reads structurally.
 * Unknown top-level keys (permissions, hooks, etc.) are preserved on update. */
interface AgentSettings {
  env?: Record<string, string | undefined>;
  /** Claude auto-memory toggle (ADR-0.4-6). mineco merge-writes `true` so the
   * engine reads/writes memory in the ADR-0.4-3 symlinked dir. The directory
   * itself stays the default (`autoMemoryDirectory` UNSET) — one link covers it. */
  autoMemoryEnabled?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Root directory for all Claude Agent config dirs: `~/.mineco/engines/claude/`. */
function enginesDir(): string {
  return path.join(os.homedir(), ".mineco", "engines", "claude");
}

/** Absolute path for a specific agent's config dir. */
export function getConfigDir(agentId: string): string {
  return path.join(enginesDir(), agentId);
}

function manifestPath(agentId: string): string {
  return path.join(getConfigDir(agentId), "agent.json");
}

function settingsPath(agentId: string): string {
  return path.join(getConfigDir(agentId), "settings.json");
}

// ---------------------------------------------------------------------------
// Internal readers (tolerate missing / corrupt files)
// ---------------------------------------------------------------------------

async function readManifest(agentId: string): Promise<AgentManifest | null> {
  try {
    const raw = await fs.readFile(manifestPath(agentId), "utf8");
    return JSON.parse(raw) as AgentManifest;
  } catch {
    return null;
  }
}

async function readSettings(agentId: string): Promise<AgentSettings> {
  try {
    const raw = await fs.readFile(settingsPath(agentId), "utf8");
    return JSON.parse(raw) as AgentSettings;
  } catch {
    return {};
  }
}

async function writeSettings(
  agentId: string,
  settings: AgentSettings,
): Promise<void> {
  await fs.writeFile(
    settingsPath(agentId),
    JSON.stringify(settings, null, 2),
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

function manifestToAgent(manifest: AgentManifest): Agent {
  return {
    id: manifest.id,
    name: manifest.name,
    engine: manifest.engine,
    configDir: getConfigDir(manifest.id),
    authMode: manifest.authMode ?? "api",
    defaultModel: manifest.defaultModel,
    createdAt: manifest.createdAt,
  };
}

/** Builds the settings.json `env` block from the connection. In `api` mode the
 * connection is folded in as usual. In `subscription` mode the connection does
 * not apply — OAuth (`.credentials.json`) is authoritative and model roles
 * resolve upstream — so every connection-derived key (credentials + model
 * mapping) is dropped, leaving only unrelated keys the user set by hand. */
function buildEnv(
  existing: Record<string, string | undefined>,
  input: AgentInput,
): Record<string, string> {
  if (input.authMode === "subscription") {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(existing)) {
      if (typeof v === "string") env[k] = v;
    }
    for (const key of connectionEnvKeys()) delete env[key];
    return env;
  }
  return applyConnectionToEnv(existing, input.connection);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lists all configured agents by scanning `~/.mineco/engines/claude/`. Each
 * subdirectory that contains a readable `agent.json` is an Agent. Directories
 * with missing / corrupt manifests are silently skipped.
 */
export async function listAgents(): Promise<Agent[]> {
  const dir = enginesDir();
  let entries: string[] = [];
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    // Directory doesn't exist yet — return empty.
    return [];
  }

  const agents: Agent[] = [];
  for (const entry of entries) {
    const manifest = await readManifest(entry);
    if (manifest) agents.push(manifestToAgent(manifest));
  }
  return agents.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Returns the {@link Agent} plus its decoded connection from `settings.json`.
 * Returns null if the agent directory / manifest is missing.
 */
export async function getAgentDetail(
  agentId: string,
): Promise<AgentDetail | null> {
  const manifest = await readManifest(agentId);
  if (!manifest) return null;
  const settings = await readSettings(agentId);
  return {
    ...manifestToAgent(manifest),
    connection: envToConnection(settings.env ?? {}),
  };
}

/**
 * Creates a new agent directory with its `agent.json` manifest and
 * `settings.json`. The new directory IS the `CLAUDE_CONFIG_DIR`; the SDK will
 * self-manage credentials and native session JSONL inside it.
 */
export async function createAgent(input: AgentInput): Promise<Agent> {
  const id = randomUUID();
  const configDir = getConfigDir(id);
  await fs.mkdir(configDir, { recursive: true });

  const manifest: AgentManifest = {
    id,
    name: input.name.trim() || "Agent",
    engine: "claude",
    authMode: input.authMode,
    defaultModel: input.defaultModel || "sonnet",
    createdAt: Date.now(),
  };
  await fs.writeFile(
    manifestPath(id),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  const settings: AgentSettings = {
    // Enable Claude auto-memory so it reads/writes the ADR-0.4-3 symlinked dir
    // (ADR-0.4-6 / R10). `autoMemoryDirectory` stays unset — the link covers it.
    autoMemoryEnabled: true,
    env: buildEnv({}, input),
  };
  await writeSettings(id, settings);

  return manifestToAgent(manifest);
}

/**
 * Updates an existing agent. Rewrites `agent.json` with the new display fields
 * and merges the connection back into `settings.json` `env`, preserving all
 * other keys (permissions, hooks, etc.) that the user may have set via the raw
 * editor.
 */
export async function updateAgent(
  agentId: string,
  input: AgentInput,
): Promise<Agent> {
  const existing = await readManifest(agentId);
  if (!existing) throw new Error(`Agent not found: ${agentId}`);

  const manifest: AgentManifest = {
    ...existing,
    name: input.name.trim() || existing.name,
    authMode: input.authMode,
    defaultModel: input.defaultModel || existing.defaultModel,
  };
  await fs.writeFile(
    manifestPath(agentId),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  // Merge env into existing settings — preserve unknown keys (permissions/hooks).
  // Also merge-write `autoMemoryEnabled:true` (ADR-0.4-6 / R10) so pre-0.4 agents
  // pick up native-dir memory on next save, without clobbering token/baseURL/aliases.
  const existingSettings = await readSettings(agentId);
  const mergedSettings: AgentSettings = {
    ...existingSettings,
    autoMemoryEnabled: true,
    env: buildEnv(existingSettings.env ?? {}, input),
  };
  await writeSettings(agentId, mergedSettings);

  return manifestToAgent(manifest);
}

/**
 * Permanently removes an agent's directory (including its native session JSONL,
 * credentials, and settings). This cannot be undone.
 */
export async function deleteAgent(agentId: string): Promise<void> {
  try {
    await fs.rm(getConfigDir(agentId), { recursive: true, force: true });
  } catch {
    // Already gone — treat as success.
  }
}

/**
 * Returns the raw `settings.json` text for the advanced in-app editor. Returns
 * an empty-object string if the file is missing.
 */
export async function readAgentSettings(agentId: string): Promise<string> {
  try {
    return await fs.readFile(settingsPath(agentId), "utf8");
  } catch {
    return "{}";
  }
}

/**
 * Writes `raw` directly as the agent's `settings.json`. Used by the raw editor
 * escape hatch; callers are responsible for valid JSON.
 */
export async function writeAgentSettings(
  agentId: string,
  raw: string,
): Promise<void> {
  await fs.mkdir(getConfigDir(agentId), { recursive: true });
  await fs.writeFile(settingsPath(agentId), raw, "utf8");
}

/**
 * Resolves a model alias (`sonnet` | `opus` | `haiku`) to the concrete model
 * id configured in the agent's `settings.json` env. Falls back to the alias
 * itself when no concrete model is configured (lets the SDK's own default drive).
 */
export async function resolveModel(
  agentId: string,
  alias: string,
): Promise<string> {
  const settings = await readSettings(agentId);
  const env = settings.env ?? {};
  const resolved = env[`ANTHROPIC_DEFAULT_${alias.toUpperCase()}_MODEL`];
  return typeof resolved === "string" && resolved.trim() ? resolved : alias;
}
