import type {
  Agent,
  EngineCapabilities,
  EngineId,
  McpServerEntry,
  Message,
  NormalizedEvent,
  RunMode,
} from "../../src/lib/agent-protocol";

/** Everything an engine needs to run one turn.
 *
 * One query = (selected Agent's `configDir`) × (workspace `cwd` + assembled
 * injection context). `resume` is valid ONLY within the same config dir (same
 * agentId); switching agents starts a fresh native thread that `buildPrompt`
 * rehydrates from `seedHistory`. Global instructions and memory are injected by
 * the adapter via the system-prompt `append`, NOT through `buildPrompt`. */
export interface EngineRunInput {
  prompt: string;
  cwd: string;
  /** The named agent (config dir + default model) for this turn. */
  agent: Agent;
  /** The model alias chosen this turn (`sonnet` | `opus` | `haiku`). */
  modelAlias: string;
  /** The chosen run mode (engine-defined). */
  mode: RunMode;
  /** Contents of `~/.mineco/MINECO.md`, appended to the system prompt. */
  globalInstructions?: string;
  /** Assembled workspace memory block, appended to the system prompt. */
  memory?: string;
  /** Merged effective MCP server set (M2; may be empty). */
  mcpServers?: McpServerEntry[];
  /** Same-agent continuation: resume the engine's own native thread. Only valid
   * within the same `configDir`. */
  resume?: { nativeThreadId: string };
  /** Cross-agent (or first) turn: the canonical transcript to rehydrate the
   * freshly-started native thread with. Ignored when `resume` is set. */
  seedHistory?: Message[];
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
  signal: AbortSignal;
}

/** A backend mineco can drive (Claude Agent SDK; a future engine slot). Adapters
 * translate a native SDK into the engine-neutral {@link NormalizedEvent}
 * stream. */
export interface Engine {
  readonly id: EngineId;
  /** Static capability descriptor (run modes, resume/thinking/MCP/skills). */
  capabilities(): EngineCapabilities;
  run(input: EngineRunInput): AsyncIterable<NormalizedEvent>;
}

/**
 * Builds the prompt sent to the engine.
 *
 * - Resuming a native thread, or the first-ever turn: send only the new user
 *   message (native state / a fresh thread carries continuity).
 * - Switching agents (different `configDir`): prepend the prior transcript as a
 *   `<transcript>` block, then the new user message — this is what carries
 *   continuity across agents, since native thread state is not portable between
 *   isolated config dirs.
 *
 * Memory and global instructions are NOT injected here — the adapter appends
 * them to the system prompt.
 */
export function buildPrompt(input: EngineRunInput): string {
  if (input.resume || !input.seedHistory?.length) {
    return input.prompt;
  }

  const transcript = input.seedHistory
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
    input.prompt,
  ].join("\n");
}
