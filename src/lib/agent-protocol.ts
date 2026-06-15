/**
 * Shared contract between the Electron main process (where the agent engines
 * run) and the renderer (Svelte). Holds the engine-neutral domain model, the
 * normalized event stream both engines emit, and the IPC channel names +
 * payload shapes. Both sides import this; type-only fields are erased at build
 * time, the small runtime helpers are bundled into each side independently.
 */

/** The agent engines mineco can drive. */
export type EngineId = "claude" | "codex";

/** User-configured provider: which engine, model, and credentials to run with. */
export interface ProviderProfile {
  id: string;
  name: string;
  engine: EngineId;
  model: string;
  /** Plaintext for v1 (Keychain is a follow-up). Empty = rely on ambient env. */
  apiKey: string;
  /** Optional custom gateway (ANTHROPIC_BASE_URL / Codex baseUrl). */
  baseUrl: string;
}

/** Fields a caller supplies to create a profile (server assigns `id`). */
export type ProfileInput = Omit<ProviderProfile, "id">;

/** An engine-neutral conversation. Not bound to a single engine. */
export interface Session {
  id: string;
  title: string;
  cwd: string;
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
  /** Which engine produced this message (null for user messages). */
  engine: EngineId | null;
  createdAt: number;
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
  profileId: string;
  engine: EngineId;
  /** The engine's own thread/session id, used to resume same-engine turns. */
  nativeThreadId: string | null;
  usage: NormalizedUsage | null;
  status: "running" | "done" | "error";
  createdAt: number;
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

// ---------------------------------------------------------------------------
// IPC channels
// ---------------------------------------------------------------------------

/** Request/response CRUD channels (ipcRenderer.invoke / ipcMain.handle). */
export const CH = {
  profilesList: "mineco:profiles:list",
  profilesCreate: "mineco:profiles:create",
  profilesUpdate: "mineco:profiles:update",
  profilesDelete: "mineco:profiles:delete",
  sessionsList: "mineco:sessions:list",
  sessionsCreate: "mineco:sessions:create",
  sessionsDelete: "mineco:sessions:delete",
  sessionMessages: "mineco:sessions:messages",
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
  profileId: string;
  prompt: string;
}

/** Per-request channel the main process streams turn events back on. */
export function turnEventChannel(id: string): string {
  return `mineco:turn:event:${id}`;
}
