/**
 * event-reducer.ts — pure function that folds a NormalizedEvent from the
 * engine into the current AssistantBlock (the live view model). No side
 * effects; the caller mutates the $state proxy returned by the array.
 *
 * Tool pairing: each tool_use "start" creates a ToolGroupItem; the matching
 * "end" (same id) updates status/diff/output/result. Adjacent calls whose
 * `group` key matches are rendered together in the UI (the UI reads the
 * `tools` array and groups by `group`).
 */

import type { NormalizedEvent, NormalizedUsage } from "./agent-protocol";

/** One tool invocation in the live block (start + end merged). */
export interface ToolItem {
  id: string;
  name: string;
  /** Group key for grouping adjacent same-kind calls in the UI. */
  group?: string;
  detail?: string;
  phase: "start" | "end";
  diff?: { path: string; added: number; removed: number; patch?: string };
  output?: string;
  status?: "ok" | "error";
  result?: string;
}

/** One step in a plan (TodoWrite / ExitPlanMode). */
export interface PlanStep {
  id: string;
  text: string;
  status: "pending" | "active" | "done";
}

/** A question the engine asked mid-turn. */
export interface QuestionCard {
  questionId: string;
  kind: "single" | "multi";
  prompt: string;
  options: { id: string; label: string; recommended?: boolean }[];
  allowFreeText: boolean;
}

/** An approval request from the engine. */
export interface ApprovalCard {
  approvalId: string;
  title: string;
  diff?: { path: string; added: number; removed: number; patch?: string };
}

/** The mutable live view-model for a streaming assistant turn. */
export interface LiveBlock {
  kind: "assistant";
  id: string;
  reasoning: string;
  reasoningLive: boolean;
  reasoningMs: number;
  reasoningStart: number;
  text: string;
  tools: ToolItem[];
  plan: PlanStep[] | null;
  question: QuestionCard | null;
  approval: ApprovalCard | null;
  agentName: string;
  model: string;
  engine: string | null;
  time: string;
  status: "running" | "done" | "error";
  error: string;
  usage: NormalizedUsage | null;
}

/**
 * Fold one NormalizedEvent into the live block in place.
 * Call with the proxy you read *back out* of the $state array, not an original literal.
 *
 * Returns `"done"` or `"error"` when the turn is terminal; otherwise returns `null`.
 */
export function applyEvent(
  b: LiveBlock,
  e: NormalizedEvent,
): "done" | "error" | null {
  switch (e.type) {
    case "thread":
      // Nativethread id is handled by the caller (session-runner persists it).
      return null;

    case "reasoning":
      b.reasoning += e.text;
      b.reasoningLive = b.text.length === 0;
      return null;

    case "text":
      if (b.reasoningLive) {
        b.reasoningLive = false;
        b.reasoningMs = Date.now() - b.reasoningStart;
      }
      b.text += e.text;
      return null;

    case "tool": {
      if (e.phase === "start") {
        b.tools.push({
          id: e.id,
          name: e.name,
          group: e.group,
          detail: e.detail,
          phase: "start",
        });
      } else {
        // Find the matching start entry and enrich it.
        const idx = b.tools.findIndex((t) => t.id === e.id);
        if (idx !== -1) {
          const existing = b.tools[idx];
          b.tools[idx] = {
            ...existing,
            phase: "end",
            diff: e.diff ?? existing.diff,
            output: e.output ?? existing.output,
            status: e.status ?? existing.status,
            result: e.result ?? existing.result,
          };
        } else {
          // Orphaned end — still record it.
          b.tools.push({
            id: e.id,
            name: e.name,
            phase: "end",
            status: e.status,
            result: e.result,
          });
        }
      }
      return null;
    }

    case "plan":
      b.plan = e.steps.map((s) => ({
        id: s.id,
        text: s.text,
        status: s.status,
      }));
      return null;

    case "question":
      b.question = {
        questionId: e.questionId,
        kind: e.kind,
        prompt: e.prompt,
        options: e.options,
        allowFreeText: e.allowFreeText,
      };
      return null;

    case "approval":
      b.approval = {
        approvalId: e.approvalId,
        title: e.title,
        diff: e.diff,
      };
      return null;

    case "result":
      if (b.reasoningLive) {
        b.reasoningLive = false;
        b.reasoningMs = Date.now() - b.reasoningStart;
      }
      if (e.text && !b.text) b.text = e.text;
      b.usage = e.usage;
      b.status = "done";
      return "done";

    case "error":
      b.reasoningLive = false;
      b.status = "error";
      b.error = e.message;
      return "error";

    default:
      return null;
  }
}

/** Create a fresh live block ready for streaming. */
export function makeLiveBlock(opts: {
  id: string;
  agentName: string;
  model: string;
  engine: string | null;
  time: string;
}): LiveBlock {
  return {
    kind: "assistant",
    id: opts.id,
    reasoning: "",
    reasoningLive: false,
    reasoningMs: 0,
    reasoningStart: Date.now(),
    text: "",
    tools: [],
    plan: null,
    question: null,
    approval: null,
    agentName: opts.agentName,
    model: opts.model,
    engine: opts.engine,
    time: opts.time,
    status: "running",
    error: "",
    usage: null,
  };
}
