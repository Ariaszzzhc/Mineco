import type { Tool } from "@mineco/provider";
import { z } from "zod";
import type { ToolContext, ToolDefinition, ToolResult } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(
    name: string,
    argsJson: string,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { output: `Tool "${name}" not found`, isError: true };
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsJson);
    } catch {
      return { output: `Invalid JSON arguments for ${name}`, isError: true };
    }

    try {
      return await tool.execute(args as never, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { output: `Tool "${name}" error: ${message}`, isError: true };
    }
  }

  toApiTools(): Tool[] {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters),
    }));
  }
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}
