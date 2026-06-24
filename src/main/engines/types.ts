import type {
  Agent,
  EngineCapabilities,
  EngineId,
  McpServerEntry,
  Message,
  NormalizedEvent,
  RunMode,
} from "@/shared/agent-protocol";

/**
 * Everything an engine needs to OPEN a persistent session.
 *
 * A session = (selected Agent's `configDir`) × (workspace `cwd` + assembled
 * injection context). It owns one long-lived native query/subprocess that stays
 * warm across turns; per-turn settings (model, permission mode) are applied via
 * control requests, not by reopening.
 *
 * Continuity is established ONCE, when the session is opened:
 *   - `resume` re-attaches the engine's own native thread by its SDK session
 *     UUID. After ADR-0.4-3 linking, this is no longer same-*agent* only: every
 *     same-workspace agent on the SAME engine reaches the prior thread's JSONL
 *     through the shared `projects/<encoded-cwd>` symlink, so same-engine cold
 *     reopen resumes natively (ADR-0.4-5 / FR-7). The runner guards resume with
 *     an `fs.stat` of the JSONL at the linked target.
 *   - `seedHistory` rehydrates a FRESH native thread with the prior canonical
 *     transcript. It is CROSS-ENGINE-ONLY now (native thread state isn't
 *     portable between different engines): single-engine this cycle, so it is
 *     effectively dead code until a 2nd engine ships. It shapes only the first
 *     turn's prompt.
 *
 * Global instructions and memory are injected by the adapter via the
 * system-prompt `append`; they are fixed for the session's lifetime (a session
 * must be reopened to pick up changes), mirroring a real Claude session.
 */
export interface EngineSessionInit {
  cwd: string;
  /** The named agent (config dir + default model) bound to this session. */
  agent: Agent;
  /** Absolute path to the engine's native CLI executable, provisioned on
   * demand (see `services/cli-binary`). When set, it is passed to the SDK as
   * `pathToClaudeCodeExecutable`, bypassing the SDK's own optional-package
   * resolver. Omit to let the SDK resolve its bundled binary itself. */
  cliExecutablePath?: string;
  /** Contents of `~/.mineco/MINECO.md`, appended to the system prompt. */
  globalInstructions?: string;
  /** Assembled workspace memory block, appended to the system prompt. */
  memory?: string;
  /** Merged effective MCP server set (M2; may be empty). */
  mcpServers?: McpServerEntry[];
  /** Cold reopen: resume the engine's own native thread. `nativeThreadId` is
   * the SDK session UUID (passed verbatim to the SDK's `resume`). Valid across
   * same-engine agents in one workspace via the ADR-0.4-3 shared link, not just
   * the same agent. */
  resume?: { nativeThreadId: string };
  /** Fresh thread: prior transcript to rehydrate. CROSS-ENGINE-ONLY (native
   * thread state isn't portable between engines) — dead code until a 2nd engine
   * ships. Used only to shape the FIRST turn's prompt; ignored when `resume` is
   * set. */
  seedHistory?: Message[];
}

/** Per-turn inputs handed to {@link EngineSession.runTurn}. */
export interface TurnInput {
  prompt: string;
  /** The model alias chosen this turn (`sonnet` | `opus` | `fable` | `haiku`). */
  modelAlias: string;
  /** The concrete wire model id the alias resolves to, from the agent's
   * `settings.json` env (e.g. `glm-5.2[1m]`). Empty when the alias has no
   * mapping. The runtime `set_model` control request — unlike the startup
   * `--model` flag — does NOT re-resolve role aliases through
   * `ANTHROPIC_DEFAULT_<ROLE>_MODEL`, so the engine must switch the live query
   * to this concrete id; otherwise the per-turn pick silently no-ops and the
   * session keeps running its seeded default model. */
  model: string;
  /** The chosen run mode (engine-defined). */
  mode: RunMode;
  /** Bridge for an approval request (e.g. an edit). Defaults to allow when not
   * wired, so Auto/Default never hang. */
  onApproval?: (req: {
    approvalId: string;
    title: string;
    // biome-ignore lint/suspicious/noExplicitAny: engine-specific diff shape.
    diff?: any;
  }) => Promise<{ approve: boolean; message?: string }>;
  /** Bridge for a question (AskUserQuestion). */
  onQuestion?: (req: {
    questionId: string;
    kind: "single" | "multi";
    prompt: string;
    // biome-ignore lint/suspicious/noExplicitAny: engine-specific option shape.
    options: any[];
    allowFreeText: boolean;
  }) => Promise<{ optionIds: string[]; freeText?: string }>;
}

/**
 * A persistent engine session bound to one (session, agent). Wraps a single
 * long-lived native query; turns are sequential (mineco's UI gates on `busy`).
 */
export interface EngineSession {
  /** The agent id this session is bound to (its `configDir` can't change). */
  readonly agentId: string;
  /** Run one turn: push the user message and stream {@link NormalizedEvent}s
   * until the turn's terminal `result`/`error`. The session stays alive after. */
  runTurn(input: TurnInput): AsyncIterable<NormalizedEvent>;
  /** Interrupt the in-flight turn (the session/query stays alive). */
  interrupt(): Promise<void>;
  /** Tear down the underlying query/subprocess. */
  close(): Promise<void>;
}

/** A backend mineco can drive (Claude Agent SDK; a future engine slot). Adapters
 * translate a native SDK into the engine-neutral {@link NormalizedEvent}
 * stream via persistent {@link EngineSession}s. */
export interface Engine {
  readonly id: EngineId;
  /** Static capability descriptor (run modes, resume/thinking/MCP/skills). */
  capabilities(): EngineCapabilities;
  /** Open a persistent session (creates the long-lived native query). */
  openSession(init: EngineSessionInit): EngineSession;
}

/**
 * Builds the FIRST user message sent on a freshly-opened session.
 *
 * - Resuming, or the first-ever turn with no prior history: send only the new
 *   user message (native state / a fresh thread carries continuity).
 * - Seeding a fresh thread under a new agent (`seedHistory` present): prepend
 *   the prior transcript as a `<transcript>` block, then the new user message —
 *   this is what carries continuity across agents, since native thread state is
 *   not portable between isolated config dirs.
 *
 * Memory and global instructions are NOT injected here — the adapter appends
 * them to the system prompt.
 */
export function buildFirstPrompt(
  prompt: string,
  seedHistory?: Message[],
): string {
  if (!seedHistory?.length) return prompt;

  const transcript = seedHistory
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  return [
    "You are continuing an existing conversation that was previously handled by",
    "another agent. Here is the transcript so far:",
    "",
    "<transcript>",
    transcript,
    "</transcript>",
    "",
    "Continue the conversation. The user's next message is:",
    "",
    prompt,
  ].join("\n");
}
