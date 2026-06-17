/**
 * Shared contract between the Electron main process (where the agent engines
 * run) and the renderer (Svelte). Holds the engine-neutral domain model, the
 * normalized event stream both engines emit, and the IPC channel names +
 * payload shapes. Both sides import this; type-only fields are erased at build
 * time, the small runtime helpers are bundled into each side independently.
 */

/** The agent engines mineco can drive. */
export type EngineId = "claude" | "codex";

/** How aggressively a turn is allowed to act (mapped to engine permission/sandbox). */
export type RunMode = "default" | "plan" | "auto" | "acceptEdits";

/**
 * A named (engine + connection + model(s) + system prompt) unit the user picks
 * per turn. Claude runs resolve a concrete model via `models` (alias map); Codex
 * runs use the single `model` + `effort`.
 */
export interface Agent {
  id: string;
  name: string;
  engine: EngineId;
  /** Optional custom gateway (ANTHROPIC_BASE_URL / Codex baseUrl). */
  baseUrl: string;
  /** Plaintext for v1 (Keychain is a follow-up). Empty = rely on ambient env. */
  apiKey: string;
  /** Claude alias -> concrete model id map. */
  models: { sonnet: string; opus: string; haiku: string };
  /** Codex single model (ignored for Claude runs). */
  model: string;
  /** Codex reasoning effort. */
  effort: "low" | "medium" | "high";
  /** Extra system instructions; appended to or replacing the engine default. */
  systemPrompt: string;
  promptMode: "append" | "replace";
  createdAt: number;
}

/** Fields a caller supplies to create an agent (server assigns `id`/`createdAt`). */
export type AgentInput = Omit<Agent, "id" | "createdAt">;

/** A project root (or shared scratch when `path` is empty). */
export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

/** An engine-neutral conversation. Not bound to a single engine. */
export interface Session {
  id: string;
  /** Owning workspace, or null for the shared/scratch space. */
  workspaceId: string | null;
  title: string;
  cwd: string;
  status: "idle" | "running" | "error";
  createdAt: number;
}

/** A row in the canonical, engine-neutral transcript — the portable source of
 * truth that lets a session switch engines mid-conversation. */
export interface Message {
  id: string;
  sessionId: string;
  turnId: string;
  role: "user" | "assistant";
  content: string;
  /** Concatenated thinking/reasoning text for the turn (assistant only). */
  reasoning: string;
  /** JSON string of `{ name; detail? }[]` — tools the assistant turn invoked. */
  tools: string;
  /** Which engine produced this message (null for user messages). */
  engine: EngineId | null;
  createdAt: number;
}

/** Persistent per-workspace memory injected into seeded prompts. */
export interface MemoryEntry {
  id: string;
  workspaceId: string;
  kind: "fact" | "convention" | "preference";
  text: string;
  createdAt: number;
}

/** A configured MCP server (Claude tool extension). */
export interface McpServer {
  id: string;
  name: string;
  transport: "stdio" | "http";
  scope: "global" | "project" | "local";
  enabled: boolean;
  /** For stdio: the command line. For http: the URL. */
  command: string;
  /** JSON string of `Record<string,string>` env (stdio) / headers (http). */
  env: string;
  createdAt: number;
}

/** A configured skill (informational for v1). */
export interface Skill {
  id: string;
  name: string;
  description: string;
  scope: "global" | "project" | "local";
  source: string;
  enabled: boolean;
  createdAt: number;
}

/** Appearance + locale settings (stored as a singleton row). */
export interface Appearance {
  theme: "dark" | "light";
  accent: string;
  platform: "mac" | "win";
  fontScale: number;
  lang: "en" | "zh";
}

/** Token/cost accounting for one turn, normalized across engines. */
export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  costUsd?: number;
}

/** One prompt→stream run, recording the engine and its native resume handle. */
export interface TurnRecord {
  id: string;
  sessionId: string;
  agentId: string;
  engine: EngineId;
  /** The chosen run mode for this turn. */
  mode: RunMode;
  /** The concrete model this turn ran with. */
  model: string;
  /** The engine's own thread/session id, used to resume same-engine turns. */
  nativeThreadId: string | null;
  usage: NormalizedUsage | null;
  status: "running" | "done" | "error";
  createdAt: number;
}

/** A single tool invocation recorded for an assistant turn. */
export interface ToolRecord {
  name: string;
  detail?: string;
}

/** The unified event stream both engine adapters emit and the renderer renders. */
export type NormalizedEvent =
  /** Engine reported its native thread/session id (capture for resume). */
  | { type: "thread"; nativeThreadId: string }
  /** Assistant text (delta for Claude, whole item for Codex). */
  | { type: "text"; text: string }
  /** Thinking / reasoning output. */
  | { type: "reasoning"; text: string }
  /** A tool / command the engine invoked. */
  | { type: "tool"; name: string; detail?: string }
  /** Terminal success: final text + usage. */
  | { type: "result"; text: string; usage: NormalizedUsage | null }
  /** Terminal failure. */
  | { type: "error"; message: string };

/** Static per-engine run-mode lists (exposed synchronously via the bridge). */
export const RUN_MODES: Record<EngineId, RunMode[]> = {
  claude: ["default", "plan", "auto", "acceptEdits"],
  codex: ["default", "plan", "auto"],
};

// ---------------------------------------------------------------------------
// IPC channels
// ---------------------------------------------------------------------------

/** Request/response CRUD channels (ipcRenderer.invoke / ipcMain.handle). */
export const CH = {
  agentsList: "mineco:agents:list",
  agentsCreate: "mineco:agents:create",
  agentsUpdate: "mineco:agents:update",
  agentsDelete: "mineco:agents:delete",

  workspacesList: "mineco:workspaces:list",
  workspacesCreate: "mineco:workspaces:create",
  workspacesUpdate: "mineco:workspaces:update",
  workspacesDelete: "mineco:workspaces:delete",
  workspacesPick: "mineco:workspaces:pickDirectory",

  sessionsList: "mineco:sessions:list",
  sessionsCreate: "mineco:sessions:create",
  sessionsDelete: "mineco:sessions:delete",
  sessionMessages: "mineco:sessions:messages",

  memoryList: "mineco:memory:list",
  memoryCreate: "mineco:memory:create",
  memoryUpdate: "mineco:memory:update",
  memoryDelete: "mineco:memory:delete",

  mcpList: "mineco:mcp:list",
  mcpCreate: "mineco:mcp:create",
  mcpUpdate: "mineco:mcp:update",
  mcpDelete: "mineco:mcp:delete",

  skillsList: "mineco:skills:list",
  skillsCreate: "mineco:skills:create",
  skillsUpdate: "mineco:skills:update",
  skillsDelete: "mineco:skills:delete",

  appearanceGet: "mineco:appearance:get",
  appearanceSet: "mineco:appearance:set",

  /** Streaming run (ipcRenderer.send); events come back on turnEventChannel(id). */
  turnRun: "mineco:turn:run",
  turnAbort: "mineco:turn:abort",
} as const;

/** Renderer -> main: run one turn. Streams `NormalizedEvent`s back on
 * `turnEventChannel(id)`. */
export interface TurnRunRequest {
  /** Correlates the request with its event stream. */
  id: string;
  sessionId: string;
  agentId: string;
  /** The concrete model to run with (Claude). For Codex the agent's model wins. */
  model: string;
  mode: RunMode;
  prompt: string;
}

/** Per-request channel the main process streams turn events back on. */
export function turnEventChannel(id: string): string {
  return `mineco:turn:event:${id}`;
}
