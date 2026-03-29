import type { z } from "zod";

export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  parameters: T;
  execute: (params: z.infer<T>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  workingDir: string;
  signal?: AbortSignal;
}

export interface ToolResult {
  output: string;
  isError?: boolean;
}
