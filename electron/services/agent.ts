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
 * Agents are NEVER stored in mineco.db. The DB only holds runtime state (sessions /
 * turns / messages / workspace pointers). All Agent identity and connection info
 * lives here on the filesystem.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  Agent,
  AgentConnection,
  AgentDetail,
  AgentInput,
  EngineId,
} from "../../src/lib/agent-protocol";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** The shape written to / read from `agent.json`. */
interface AgentManifest {
  id: string;
  name: string;
  engine: EngineId;
  defaultModel: string;
  createdAt: number;
}

/** The subset of `settings.json` that mineco writes / reads structurally.
 * Unknown top-level keys (permissions, hooks, etc.) are preserved on update. */
interface AgentSettings {
  env?: {
    ANTHROPIC_BASE_URL?: string;
    ANTHROPIC_AUTH_TOKEN?: string;
    ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
    ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
    ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
    [key: string]: string | undefined;
  };
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
    defaultModel: manifest.defaultModel,
    createdAt: manifest.createdAt,
  };
}

function settingsToConnection(settings: AgentSettings): AgentConnection {
  const env = settings.env ?? {};
  return {
    baseUrl: env.ANTHROPIC_BASE_URL ?? "",
    token: env.ANTHROPIC_AUTH_TOKEN ?? "",
    models: {
      sonnet: env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? "",
      opus: env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? "",
      haiku: env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? "",
    },
  };
}

function connectionToEnvPatch(
  connection: AgentConnection,
): AgentSettings["env"] {
  return {
    ANTHROPIC_BASE_URL: connection.baseUrl,
    ANTHROPIC_AUTH_TOKEN: connection.token,
    ANTHROPIC_DEFAULT_SONNET_MODEL: connection.models.sonnet,
    ANTHROPIC_DEFAULT_OPUS_MODEL: connection.models.opus,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: connection.models.haiku,
  };
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
    connection: settingsToConnection(settings),
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
    defaultModel: input.defaultModel || "sonnet",
    createdAt: Date.now(),
  };
  await fs.writeFile(
    manifestPath(id),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  const settings: AgentSettings = {
    env: connectionToEnvPatch(input.connection),
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
    defaultModel: input.defaultModel || existing.defaultModel,
  };
  await fs.writeFile(
    manifestPath(agentId),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  // Merge env into existing settings — preserve unknown keys (permissions/hooks).
  const existingSettings = await readSettings(agentId);
  const mergedSettings: AgentSettings = {
    ...existingSettings,
    env: {
      ...(existingSettings.env ?? {}),
      ...connectionToEnvPatch(input.connection),
    },
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
  const key =
    `ANTHROPIC_DEFAULT_${alias.toUpperCase()}_MODEL` as keyof typeof env;
  const resolved = env[key];
  return typeof resolved === "string" && resolved.trim() ? resolved : alias;
}
