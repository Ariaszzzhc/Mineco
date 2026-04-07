import type { z } from "zod";
import type { AgentEvent } from "../types.js";
import type { PermissionDecision, PermissionRequest } from "./permission.js";

export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: T;
  isConcurrencySafe?: (params: z.infer<T>) => boolean;
  execute: (params: z.infer<T>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  workingDir: string;
  signal?: AbortSignal;
  sessionId?: string;
  providerId?: string;
  model?: string;
  emitEvent?: (event: AgentEvent) => Promise<void>;
  requestPermission?: (
    request: PermissionRequest,
  ) => Promise<PermissionDecision>;
}

export interface ToolResult {
  output: string;
  isError?: boolean;
}
