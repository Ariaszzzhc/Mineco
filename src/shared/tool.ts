import type { ZodSchema } from 'zod';

export interface ToolDefinition<T = unknown> {
  name: string;
  description: string;
  parameters: ZodSchema<T>;
  execute: (params: T, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  workingDir: string;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export function defineTool<T>(
  definition: ToolDefinition<T>
): ToolDefinition<T> {
  return definition;
}
