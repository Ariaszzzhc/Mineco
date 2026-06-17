import type {
  Agent,
  EngineId,
  McpServer,
  MemoryEntry,
  Message,
  NormalizedEvent,
  RunMode,
} from "../../src/lib/agent-protocol";

/** Everything an engine needs to run one turn. */
export interface EngineRunInput {
  prompt: string;
  cwd: string;
  /** The named agent (engine + credentials + system prompt) for this turn. */
  agent: Agent;
  /** The concrete model to run with (Claude alias already resolved). */
  model: string;
  /** How aggressively the turn may act. */
  mode: RunMode;
  /** Workspace memory injected as a context block when seeding a fresh thread. */
  memory: MemoryEntry[];
  /** Enabled MCP servers to wire into the engine (best-effort). */
  mcpServers: McpServer[];
  /** Same-engine continuation: resume the engine's own native thread. */
  resume?: { nativeThreadId: string };
  /** Cross-engine (or first) turn: the canonical transcript to rehydrate the
   * freshly-started native thread with. Ignored when `resume` is set. */
  seedHistory?: Message[];
  signal: AbortSignal;
}

/** A backend mineco can drive (Claude Agent SDK, Codex SDK). Adapters translate
 * a native SDK into the engine-neutral {@link NormalizedEvent} stream. */
export interface Engine {
  readonly id: EngineId;
  run(input: EngineRunInput): AsyncIterable<NormalizedEvent>;
}

/** Renders workspace memory into a clearly-marked context block, or "" when
 * there is none. */
function renderMemory(memory: MemoryEntry[]): string {
  if (!memory.length) return "";
  const lines = memory.map((m) => `- (${m.kind}) ${m.text}`).join("\n");
  return [
    "<workspace-memory>",
    "Persistent facts, conventions, and preferences for this workspace:",
    lines,
    "</workspace-memory>",
    "",
  ].join("\n");
}

/**
 * Builds the prompt sent to the engine. When resuming a native thread we send
 * only the new user message. When seeding a fresh thread (first turn or an
 * engine switch) we prepend the prior transcript — this is what carries
 * continuity across engines, since native thread state is not portable between
 * the Claude and Codex CLIs — plus any workspace memory as a context block.
 */
export function buildPrompt(input: EngineRunInput): string {
  const memoryBlock = renderMemory(input.memory);

  if (input.resume || !input.seedHistory?.length) {
    // Resumed (or first-ever) turn: still surface memory if present.
    return memoryBlock ? `${memoryBlock}\n${input.prompt}` : input.prompt;
  }

  const transcript = input.seedHistory
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  return [
    memoryBlock,
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
  ]
    .filter((s) => s !== "")
    .join("\n");
}

/** Resolves the system prompt option for Claude from the agent config. Returns
 * `undefined` when the agent has no custom prompt (use the engine default). */
export function resolveSystemPrompt(
  agent: Agent,
):
  | { type: "preset"; preset: "claude_code"; append: string }
  | string
  | undefined {
  const text = agent.systemPrompt.trim();
  if (!text) return undefined;
  // append -> keep the claude_code preset and append; replace -> raw string.
  return agent.promptMode === "replace"
    ? text
    : { type: "preset", preset: "claude_code", append: text };
}
