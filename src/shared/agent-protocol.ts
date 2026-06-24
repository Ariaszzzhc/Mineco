/**
 * Shared contract between the Electron main process (where the agent engine
 * runs) and the renderer (Svelte). Holds the engine-neutral domain model, the
 * normalized event stream the engine emits, and the IPC channel names + payload
 * shapes. Both sides import this; type-only fields are erased at build time, the
 * small runtime helpers/constants are bundled into each side independently.
 *
 * Two-axis model (EDD §2.3): an **Agent** is an isolated engine config dir
 * (`CLAUDE_CONFIG_DIR`) — derived from the filesystem, not a DB row. A
 * **Workspace** is a local directory (or null = public) that scopes MCP /
 * skills / memory. One turn = (selected Agent's config dir) × (workspace dir as
 * cwd + assembled injection context). Filesystem-backed config (agents, MCP,
 * skills, memory, app settings) lives on disk; the all-file store
 * (`~/.mineco/workspaces.json` + per-session sidecars/NDJSON) holds only runtime
 * state (workspaces / sessions / messages).
 */

/** The agent engines mineco can drive. v1 is Claude-only; the abstraction keeps
 * a roadmap slot for a future engine. */
export type EngineId = "claude";

/** How an agent authenticates to the engine.
 * - `api`: a key/token (+ optional Base URL) injected via `settings.json` env
 *   (`ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL`); pay-per-use or a relay.
 * - `subscription`: the official Claude CLI's own OAuth login (Pro/Max/Team),
 *   whose `.credentials.json` lives in the agent's isolated `CLAUDE_CONFIG_DIR`
 *   and is auto-refreshed by the CLI. mineco never touches the OAuth protocol —
 *   it launches `claude auth login` in a real terminal (TTY → loopback) and
 *   reads back status. Each agent logs in independently, so multiple
 *   subscription accounts can coexist as separate agents. */
export type AuthMode = "api" | "subscription";

// ---------------------------------------------------------------------------
// Agents (filesystem-backed: ~/.mineco/engines/claude/<id>/)
// ---------------------------------------------------------------------------

/** A configured agent, derived from its isolated engine config directory
 * (`agent.json` manifest + Claude-native `settings.json`) — NOT a DB row. */
export interface Agent {
  id: string;
  name: string;
  engine: EngineId;
  /** Absolute path to `~/.mineco/engines/claude/<id>` (used as CLAUDE_CONFIG_DIR). */
  configDir: string;
  /** How this agent authenticates. Defaults to `api` for agents created before
   * this field existed (their manifest omits it). */
  authMode: AuthMode;
  /** Default model role (`sonnet` | `opus` | `fable` | `haiku`) — the composer
   * default. Carried as the turn's `model`; the SDK resolves it to a concrete
   * id via `ANTHROPIC_DEFAULT_<ROLE>_MODEL`. */
  defaultModel: string;
  createdAt: number;
}

/** A Claude model role alias. The CLI resolves each to a concrete upstream
 * model via `ANTHROPIC_DEFAULT_<ROLE>_MODEL`. */
export type ModelRoleId = "sonnet" | "opus" | "fable" | "haiku";

/** The four roles in display order. */
export const MODEL_ROLES: ModelRoleId[] = ["sonnet", "opus", "fable", "haiku"];

/** One model-role mapping row. The `role` alias is the value carried as a
 * turn's `model`; the CLI resolves it to `model` via the role's env var. */
export interface ModelRole {
  role: ModelRoleId;
  /** Concrete upstream model id sent on the wire, stored in
   * `ANTHROPIC_DEFAULT_<ROLE>_MODEL`. Leave empty for the SDK default. */
  model: string;
  /** Human-facing label shown in Claude Code's `/model` menu and mineco's
   * composer, stored in `ANTHROPIC_DEFAULT_<ROLE>_MODEL_NAME`. Falls back to the
   * role id when empty. Independent of {@link model} (the wire id). */
  displayName: string;
  /** Declare 1M-context support: appends the `[1m]` suffix to the model id,
   * which the CLI maps to the `context-1m` beta + a 1M context window. */
  supports1M: boolean;
}

/** Structured view of the agent's `settings.json` `env` (connection details),
 * plus the mineco-owned display names read from the manifest. */
export interface AgentConnection {
  /** ANTHROPIC_BASE_URL. */
  baseUrl: string;
  /** ANTHROPIC_AUTH_TOKEN. */
  token: string;
  /** Per-role model mapping (sonnet/opus/fable/haiku, in display order). */
  roles: ModelRole[];
  /** ANTHROPIC_MODEL — fallback for requests not routed to a named role. */
  fallbackModel: string;
}

/** An agent plus its decoded connection (settings.json env). */
export interface AgentDetail extends Agent {
  connection: AgentConnection;
}

/** Fields a caller supplies to create/update an agent. */
export interface AgentInput {
  name: string;
  authMode: AuthMode;
  defaultModel: string;
  connection: AgentConnection;
}

/** Subscription (OAuth) login state for an agent, decoded from the official
 * CLI's `.credentials.json` in the agent's `CLAUDE_CONFIG_DIR`. */
export interface SubscriptionStatus {
  /** A non-expired (or refreshable) OAuth credential is present. */
  authenticated: boolean;
  /** Subscription tier reported by the credential (`max` / `pro` / …), if any. */
  plan?: string;
  /** Access-token expiry (ms epoch); the CLI refreshes it automatically, so
   * this is informational, not a hard logout time. */
  expiresAt?: number | null;
}

// ---------------------------------------------------------------------------
// settings.json `env` <-> AgentConnection (shared by main + renderer so the
// raw-editor and the structured fields can mirror each other client-side)
// ---------------------------------------------------------------------------

/** A loose view of `settings.json`'s `env` block (values may be absent). */
export type SettingsEnv = Record<string, string | undefined>;

/** Env keys carrying API-mode credentials. They MUST be absent for a
 * `subscription` agent so the CLI's OAuth `.credentials.json` is authoritative —
 * any of these (even inherited from the host env) would otherwise win and bill
 * the wrong account. Both the settings writer and the engine adapter strip these
 * in subscription mode. */
export const API_AUTH_ENV_KEYS: readonly string[] = [
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
];

/** `env` key carrying a role's concrete wire model id. */
export function roleModelEnvKey(role: ModelRoleId): string {
  return `ANTHROPIC_DEFAULT_${role.toUpperCase()}_MODEL`;
}

/** `env` key carrying a role's display name (`/model` menu label). */
export function roleNameEnvKey(role: ModelRoleId): string {
  return `ANTHROPIC_DEFAULT_${role.toUpperCase()}_MODEL_NAME`;
}

/** Every env key mineco derives from an {@link AgentConnection}: API credentials
 * + the fallback model + each per-role model mapping (id and display name). In
 * `subscription` mode NONE of these apply — the OAuth login is authoritative and
 * model roles resolve upstream, so a custom mapping would only mis-route or
 * mis-bill. Both the settings writer and the engine adapter strip the whole set
 * in subscription mode. Superset of {@link API_AUTH_ENV_KEYS}. */
export function connectionEnvKeys(): string[] {
  const keys = [...API_AUTH_ENV_KEYS, "ANTHROPIC_MODEL"];
  for (const role of MODEL_ROLES) {
    keys.push(roleModelEnvKey(role), roleNameEnvKey(role));
  }
  return keys;
}

/** Splits a stored env model id into its concrete id + 1M declaration. The CLI
 * convention is a trailing `[1m]` suffix (e.g. `deepseek-v4-pro[1m]`). */
export function parseModelValue(raw: string | undefined): {
  model: string;
  supports1M: boolean;
} {
  const value = (raw ?? "").trim();
  if (value.toLowerCase().endsWith("[1m]")) {
    return { model: value.slice(0, -4).trim(), supports1M: true };
  }
  return { model: value, supports1M: false };
}

/** Re-attaches the `[1m]` suffix when the role declares 1M support. */
export function formatModelValue(model: string, supports1M: boolean): string {
  const trimmed = model.trim();
  if (!trimmed) return "";
  return supports1M ? `${trimmed}[1m]` : trimmed;
}

/** Decodes a settings.json `env` block into the structured connection. */
export function envToConnection(env: SettingsEnv): AgentConnection {
  const roles: ModelRole[] = MODEL_ROLES.map((role) => {
    const { model, supports1M } = parseModelValue(env[roleModelEnvKey(role)]);
    return {
      role,
      model,
      displayName: (env[roleNameEnvKey(role)] ?? "").trim(),
      supports1M,
    };
  });
  return {
    baseUrl: env.ANTHROPIC_BASE_URL ?? "",
    token: env.ANTHROPIC_AUTH_TOKEN ?? "",
    roles,
    fallbackModel: env.ANTHROPIC_MODEL ?? "",
  };
}

/** Folds the structured connection back into an `env` block, preserving any
 * unrelated keys already present in `existing` and dropping keys whose value is
 * empty (so settings.json stays clean). */
export function applyConnectionToEnv(
  existing: SettingsEnv,
  connection: AgentConnection,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(existing)) {
    if (typeof v === "string") env[k] = v;
  }
  const setOrDelete = (key: string, value: string) => {
    const t = value.trim();
    if (t) env[key] = t;
    else delete env[key];
  };
  setOrDelete("ANTHROPIC_BASE_URL", connection.baseUrl);
  setOrDelete("ANTHROPIC_AUTH_TOKEN", connection.token);
  setOrDelete("ANTHROPIC_MODEL", connection.fallbackModel);
  for (const r of connection.roles) {
    setOrDelete(
      roleModelEnvKey(r.role),
      formatModelValue(r.model, r.supports1M),
    );
    setOrDelete(roleNameEnvKey(r.role), r.displayName);
  }
  return env;
}

// ---------------------------------------------------------------------------
// Workspaces / sessions / messages (all-file store under ~/.mineco/)
// ---------------------------------------------------------------------------

/** A project root, or the public/shared space when `rootPath` is null. */
export interface Workspace {
  id: string;
  name: string;
  /** Absolute project directory, or null for the public/shared workspace. */
  rootPath: string | null;
  /** Last-used run mode id in this workspace (composer restores it). */
  lastMode: string | null;
  /** Last-used agent id in this workspace (composer restores it). */
  lastAgentId: string | null;
  createdAt: number;
}

/** An engine-neutral conversation. Belongs to a workspace + an agent. */
export interface Session {
  id: string;
  /** Owning workspace, or null for the shared/public space. */
  workspaceId: string | null;
  /** The agent the session is currently bound to (may change across turns). */
  agentId: string | null;
  title: string;
  cwd: string;
  createdAt: number;
}

/** A session with its in-memory run state merged in (main owns run state, not
 * the DB — there is no `status` column). */
export interface SessionView extends Session {
  running: boolean;
}

/** A row in the canonical, engine-neutral transcript — the portable source of
 * truth that lets a session switch agents mid-conversation. */
export interface Message {
  id: string;
  sessionId: string;
  turnId: string;
  role: "user" | "assistant";
  content: string;
  /** Concatenated thinking/reasoning text for the turn (assistant only). */
  reasoning: string;
  /** JSON string of {@link ToolRecord}`[]` — tools the assistant turn invoked. */
  tools: string;
  /** Which engine produced this message (null for user messages). */
  engine: EngineId | null;
  createdAt: number;
}

/** A single tool invocation recorded for an assistant turn. */
export interface ToolRecord {
  name: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Engine capabilities + run modes (fetched at runtime from the adapter)
// ---------------------------------------------------------------------------

/** A run mode is engine-defined and fetched at runtime; it is carried through
 * the rest of the system as an opaque string id. */
export interface RunMode {
  id: string;
  label: string;
  description: string;
  /** Whether picking this mode implies a per-edit approval gate. */
  requiresApproval?: boolean;
}

/** What an engine adapter can do, surfaced to the renderer synchronously. */
export interface EngineCapabilities {
  modes: RunMode[];
  supportsResume: boolean;
  supportsThinking: boolean;
  supportsMcp: boolean;
  supportsSkills: boolean;
  /**
   * How the engine handles long-term memory (ADR-0.4-6):
   * - `"native-dir"` — the engine reads/writes its own auto-memory directory
   *   (Claude, via the ADR-0.4-3 symlink). mineco STOPS injecting a memory block;
   *   manual edits and auto-memory converge on the same shared dir.
   * - `"inject-only"` — the engine has no native memory; mineco assembles a
   *   budget-capped block and appends it to the system prompt. Also the fallback
   *   when a session degrades to per-agent isolation (ADR-0.4-8).
   * - `"none"` — no memory support at all.
   */
  memory: "native-dir" | "inject-only" | "none";
}

// ---------------------------------------------------------------------------
// Filesystem-backed config domain (NO DB): MCP / skills / memory / settings
// ---------------------------------------------------------------------------

/** A merged MCP server entry across the three scopes (global/project/local). */
export interface McpServerEntry {
  name: string;
  scope: "global" | "project" | "local";
  transport: "stdio" | "http";
  /** stdio transport. */
  command?: string;
  args?: string[];
  /** http transport. */
  url?: string;
  env: Record<string, string>;
  enabled: boolean;
  /** Shadowed by a same-named entry in a higher-priority scope. */
  overridden?: boolean;
}

/** A merged skill entry (one `SKILL.md` directory). */
export interface SkillEntry {
  name: string;
  description: string;
  scope: "global" | "project" | "local";
  /** Absolute path to the skill's directory. */
  path: string;
  enabled: boolean;
  /** Shadowed by a same-named skill in a higher-priority scope. */
  overridden?: boolean;
}

/** One long-term-memory markdown file. */
export interface MemoryEntry {
  slug: string;
  title: string;
  description: string;
  type: "user" | "feedback" | "project" | "reference";
  body: string;
}

/** Static app/runtime info surfaced in Settings (read once, never changes). */
export interface AppInfo {
  /** App version (package.json `version`, via `app.getVersion()`). */
  version: string;
  electron: string;
  node: string;
  chrome: string;
}

/**
 * Lifecycle of the auto-updater (electron-updater). Drives the Updates card in
 * Settings; the main process owns the transitions and broadcasts each change.
 */
export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

/** Current auto-update state — broadcast to the renderer on every change. */
export interface UpdateState {
  status: UpdateStatus;
  /** Installed version (always present). */
  currentVersion: string;
  /** Version offered by the feed, when one is newer (available/downloaded). */
  newVersion?: string;
  /** Download progress 0–100, while `status === "downloading"`. */
  percent?: number;
  /** Human-readable failure, when `status === "error"`. */
  error?: string;
  /**
   * Whether self-update is even possible on this build: false in dev (no feed)
   * and on platforms/builds that can't auto-update (e.g. unsigned macOS).
   */
  supported: boolean;
}

/** Appearance + locale settings (`~/.mineco/settings.json`). */
export interface AppSettings {
  theme: "dark" | "light";
  accent: string;
  platform: "mac" | "win";
  fontScale: number;
  lang: "en" | "zh";
}

// ---------------------------------------------------------------------------
// Usage + normalized event stream
// ---------------------------------------------------------------------------

/** Token/cost accounting for one turn, normalized across engines. */
export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  costUsd?: number;
  /** Total input-side tokens of the most recent model request
   * (input + cache read + cache creation) — the live context-window fill. */
  contextTokens?: number;
  /** Context window of the model that produced the latest request, for
   * computing the fill ratio (`contextTokens / contextWindow`). */
  contextWindow?: number;
}

/** The unified event stream the engine adapter emits and the renderer renders.
 * `tool` is a paired start/end event keyed by `id`. */
export type NormalizedEvent =
  /** Engine reported its native thread/session id (capture for resume). */
  | { type: "thread"; nativeThreadId: string }
  /** Assistant text delta. */
  | { type: "text"; text: string }
  /** Thinking / reasoning output delta. */
  | { type: "reasoning"; text: string }
  /** A tool invocation — emitted twice (start, then end) sharing one `id`. */
  | {
      type: "tool";
      id: string;
      name: string;
      phase: "start" | "end";
      /** Group key for aggregating adjacent same-kind calls. */
      group?: string;
      detail?: string;
      diff?: { path: string; added: number; removed: number; patch?: string };
      output?: string;
      status?: "ok" | "error";
      result?: string;
    }
  /** The engine asked the user a question (AskUserQuestion). */
  | {
      type: "question";
      questionId: string;
      kind: "single" | "multi";
      prompt: string;
      options: { id: string; label: string; recommended?: boolean }[];
      allowFreeText: boolean;
    }
  /** The engine requested approval (e.g. an edit/write). */
  | {
      type: "approval";
      approvalId: string;
      title: string;
      diff?: { path: string; added: number; removed: number; patch?: string };
    }
  /** A plan / todo projection (TodoWrite / ExitPlanMode). */
  | {
      type: "plan";
      steps: {
        id: string;
        text: string;
        status: "pending" | "active" | "done";
      }[];
    }
  /**
   * A native Task subagent lifecycle notification (EDD §3.1). Emitted by the
   * Claude adapter when a Task tool_use begins (`phase:"start"`) and when its
   * tool_result arrives (`phase:"end"`).
   *
   * `subId`       — the SDK tool_use block id, stable across start/end.
   * `agentName`   — derived from `subagent_type` or `description` in the tool
   *                 input; falls back to `"subagent"` when absent.
   * `summary`     — short outcome text extracted from the tool result (end only).
   * `status`      — `"ok"` | `"error"` derived from `is_error` (end only).
   *
   * Memory-recall is a sibling branch below.
   */
  | {
      type: "subagent";
      subId: string;
      agentName: string;
      phase: "start" | "end";
      summary?: string;
      status?: "ok" | "error";
    }
  /**
   * The engine's memory-recall supervisor surfaced relevant memories into the
   * turn (ADR-0.4-6 / OD-4). Mirrors the SDK's `SDKMemoryRecallMessage`
   * (`subtype:"memory_recall"`): the renderer shows a subtle "recalled N
   * memories" affordance.
   *
   * `count`  — number of memories surfaced (`memories.length`).
   * `detail` — optional human hint (e.g. the recall `mode`: select/synthesize).
   */
  | { type: "memory-recall"; count: number; detail?: string }
  /** Non-terminal engine lifecycle status (e.g. provisioning the native binary
   * on first use). Informational; the renderer may surface or ignore it. */
  | { type: "status"; phase: string; detail?: string }
  /** Terminal success: final text + usage. */
  | { type: "result"; text: string; usage: NormalizedUsage | null }
  /** Terminal failure. */
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Turn request / response (bidirectional, EDD §6.5)
// ---------------------------------------------------------------------------

/** Renderer -> main: run one turn. Streams `NormalizedEvent`s back on
 * `turnEventChannel(id)`. */
export interface TurnRunRequest {
  /** Correlates the request with its event stream. */
  id: string;
  sessionId: string;
  agentId: string;
  /** The model alias to run with (`sonnet` | `opus` | `haiku`). */
  model: string;
  /** The chosen run mode id. */
  mode: string;
  prompt: string;
}

/** Renderer -> main: answer to a mid-turn question or approval request. */
export interface TurnResponse {
  /** The turn request id this answer belongs to. */
  requestId: string;
  kind: "question" | "approval";
  /** The `questionId` or `approvalId` being answered. */
  id: string;
  /** Question: selected option ids. */
  optionIds?: string[];
  /** Question: optional free-text answer. */
  freeText?: string;
  /** Approval: allow (true) or deny (false). */
  approve?: boolean;
  /** Approval: optional message accompanying a denial. */
  message?: string;
}

/** Per-request channel the main process streams turn events back on. */
export function turnEventChannel(id: string): string {
  return `mineco:turn:event:${id}`;
}

// ---------------------------------------------------------------------------
// IPC channels
// ---------------------------------------------------------------------------

/** Request/response (invoke/handle) + streaming/broadcast channel names. */
export const CH = {
  // Agents (filesystem-backed)
  agentsList: "mineco:agents:list",
  agentsCreate: "mineco:agents:create",
  agentsUpdate: "mineco:agents:update",
  agentsDelete: "mineco:agents:delete",
  agentsGet: "mineco:agents:get",
  agentsReadSettings: "mineco:agents:readSettings",
  agentsWriteSettings: "mineco:agents:writeSettings",
  // Subscription (OAuth) auth — drives the official CLI's `auth` subcommands.
  agentsAuthLogin: "mineco:agents:authLogin",
  agentsAuthStatus: "mineco:agents:authStatus",
  agentsAuthLogout: "mineco:agents:authLogout",

  // Global instructions (~/.mineco/MINECO.md)
  globalInstructionsRead: "mineco:globalInstructions:read",
  globalInstructionsWrite: "mineco:globalInstructions:write",

  // Workspaces
  workspacesList: "mineco:workspaces:list",
  workspacesCreate: "mineco:workspaces:create",
  workspacesUpdate: "mineco:workspaces:update",
  workspacesDelete: "mineco:workspaces:delete",
  workspacesActivate: "mineco:workspaces:activate",
  workspacesPick: "mineco:workspaces:pickDirectory",

  // Sessions
  sessionsList: "mineco:sessions:list",
  sessionsCreate: "mineco:sessions:create",
  sessionsDelete: "mineco:sessions:delete",
  sessionMessages: "mineco:sessions:messages",
  sessionLatestUsage: "mineco:sessions:latestUsage",

  // Memory (filesystem-backed)
  memoryList: "mineco:memory:list",
  memoryCreate: "mineco:memory:create",
  memoryUpdate: "mineco:memory:update",
  memoryDelete: "mineco:memory:delete",

  // MCP (filesystem-backed)
  mcpList: "mineco:mcp:list",
  mcpWriteScope: "mineco:mcp:writeScope",
  mcpToggle: "mineco:mcp:toggle",

  // Skills (filesystem-backed)
  skillsList: "mineco:skills:list",
  skillsToggle: "mineco:skills:toggle",
  skillsCreate: "mineco:skills:create",

  // Appearance / app settings
  appearanceGet: "mineco:appearance:get",
  appearanceSet: "mineco:appearance:set",

  // Engine capabilities
  enginesCapabilities: "mineco:engines:capabilities",

  // App info (version + runtime)
  appGetInfo: "mineco:app:getInfo",

  // Auto-update (electron-updater)
  updatesGetState: "mineco:updates:getState",
  updatesCheck: "mineco:updates:check",
  updatesDownload: "mineco:updates:download",
  updatesInstall: "mineco:updates:install",
  /** main -> renderer broadcast on every update-state transition. */
  updatesChanged: "mineco:updates:changed",

  // Turn run (send) / events come back on turnEventChannel(id)
  turnRun: "mineco:turn:run",
  turnAbort: "mineco:turn:abort",
  turnRespond: "mineco:turn:respond",
  /** main -> renderer broadcast when a session's run state changes. */
  runStateChanged: "mineco:run:stateChanged",
  /** main -> renderer broadcast when the agent set/config changes (create/update/delete). */
  agentsChanged: "mineco:agents:changed",
} as const;
