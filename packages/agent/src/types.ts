import type { Usage } from "@mineco/provider";

export interface AgentConfig {
  providerId: string;
  model: string;
  systemPrompt: string;
  workingDir: string;
  maxSteps: number;
}

export type AgentEvent =
  | { type: "text-delta"; delta: string }
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
  | { type: "error"; error: string };
