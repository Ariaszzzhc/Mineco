import type {
  EngineId,
  Message,
  NormalizedEvent,
  ProviderProfile,
} from "../../src/lib/agent-protocol";

/** Everything an engine needs to run one turn. */
export interface EngineRunInput {
  prompt: string;
  cwd: string;
  /** Model + credentials to run with. */
  profile: ProviderProfile;
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

/**
 * Renders prior transcript into a preamble prepended to the prompt when an
 * engine has no native thread to resume (first turn after an engine switch).
 * This is what carries continuity across engines, since native thread state is
 * not portable between the Claude and Codex CLIs.
 */
export function buildPrompt(input: EngineRunInput): string {
  if (input.resume || !input.seedHistory?.length) return input.prompt;

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
