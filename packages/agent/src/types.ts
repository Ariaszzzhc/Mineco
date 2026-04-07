import type { Usage } from "@mineco/provider";
import type { ExtractedNotes } from "./context/session-memory.js";
import type {
  PermissionDecision,
  PermissionRequest,
} from "./tools/permission.js";

export interface CompressionStats {
  originalTokenEstimate: number;
  finalTokenEstimate: number;
  microCompacted: boolean;
  memoryExtracted: boolean;
  toolOutputsTruncated: number;
  messagesRemoved: number;
}

export interface AgentConfig {
  providerId: string;
  model: string;
  systemPrompt: string;
  workingDir: string;
  maxSteps: number;
  signal?: AbortSignal;
  emitEvent?: (event: AgentEvent) => Promise<void>;
  requestPermission?: (
    request: PermissionRequest,
  ) => Promise<PermissionDecision>;
}

export type AgentEvent =
  | { type: "text-delta"; delta: string }
  | { type: "thinking-delta"; delta: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      result: string;
      isError: boolean;
    }
  | { type: "usage"; usage: Usage }
  | { type: "step"; step: number; maxSteps: number }
  | { type: "complete"; reason: "stop" | "max-steps" | "aborted" }
  | { type: "error"; error: string }
  | { type: "subagent-start"; runId: string; agentType: string }
  | { type: "subagent-event"; runId: string; event: AgentEvent }
  | { type: "subagent-end"; runId: string; summary: string }
  | {
      type: "context-compressed";
      stats: CompressionStats;
      notes: ExtractedNotes | null;
    }
  | {
      type: "permission-request";
      requestId: string;
      toolName: string;
      args: Record<string, unknown>;
      riskLevel: string;
      reason: string;
    };
