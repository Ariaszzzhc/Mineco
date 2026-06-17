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
 * skills, memory, app settings) lives on disk; mineco.db holds only runtime
 * state (workspaces / sessions / turns / messages).
 */

/** The agent engines mineco can drive. v1 is Claude-only; the abstraction keeps
 * a roadmap slot for a future engine. */
export type EngineId = "claude";

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
  /** Default model alias (`sonnet` | `opus` | `haiku`) — the composer default. */
  defaultModel: string;
  createdAt: number;
}

/** Structured view of the agent's `settings.json` `env` (connection details). */
export interface AgentConnection {
  /** ANTHROPIC_BASE_URL. */
  baseUrl: string;
  /** ANTHROPIC_AUTH_TOKEN. */
  token: string;
  /** Alias -> concrete model id map (ANTHROPIC_DEFAULT_<ALIAS>_MODEL). */
  models: { sonnet: string; opus: string; haiku: string };
}

/** An agent plus its decoded connection (settings.json env). */
export interface AgentDetail extends Agent {
  connection: AgentConnection;
}

/** Fields a caller supplies to create/update an agent. */
export interface AgentInput {
  name: string;
  defaultModel: string;
  connection: AgentConnection;
}

// ---------------------------------------------------------------------------
// Workspaces / sessions / messages (mineco.db)
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

  // Turn run (send) / events come back on turnEventChannel(id)
  turnRun: "mineco:turn:run",
  turnAbort: "mineco:turn:abort",
  turnRespond: "mineco:turn:respond",
  /** main -> renderer broadcast when a session's run state changes. */
  runStateChanged: "mineco:run:stateChanged",
} as const;
