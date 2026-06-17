/**
 * In-memory view models for the live chat stream. These are renderer-only and
 * not persisted — the backend owns the canonical transcript (SQLite). On load
 * we map stored `Message` rows into these blocks; during a live turn we build
 * an assistant block incrementally from `NormalizedEvent`s via `applyEvent`.
 */
import type { EngineId, ToolRecord } from "@/shared/agent-protocol";
import type { ToolItem } from "@/renderer/lib/event-reducer";

/** A user message bubble. */
export interface UserBlock {
  kind: "user";
  id: string;
  text: string;
  time: string;
}

/**
 * An assistant turn: reasoning + prose + the tools it invoked.
 * During streaming this is a LiveBlock (from event-reducer); once the turn is
 * persisted and loaded from SQLite we reconstruct it from ToolRecord[].
 */
export interface AssistantBlock {
  kind: "assistant";
  id: string;
  /** Concatenated reasoning text for the turn. */
  reasoning: string;
  /** True while reasoning is streaming and no prose has begun yet. */
  reasoningLive: boolean;
  /** Reasoning duration in ms (set when prose starts / turn ends). */
  reasoningMs: number;
  /** Streamed / stored prose text. */
  text: string;
  /** Tools invoked this turn, in order. ToolItem during streaming; ToolRecord from DB. */
  tools: ToolItem[] | ToolRecord[];
  /** Engine + model byline. */
  agentName: string;
  model: string;
  engine: EngineId | null;
  time: string;
  /** Lifecycle of the turn for spinner / error rendering. */
  status: "running" | "done" | "error";
  /** Error text when status === 'error'. */
  error: string;
}

/** Re-export LiveBlock from event-reducer so it can be used as a block. */
export type { LiveBlock } from "@/renderer/lib/event-reducer";

export type Block = UserBlock | AssistantBlock;

/** Format a unix-ms timestamp as HH:MM. */
export function fmtTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
