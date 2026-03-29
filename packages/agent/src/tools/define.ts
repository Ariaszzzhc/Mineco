import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "./types.js";

export function defineTool<T extends z.ZodType>(
  def: ToolDefinition<T>,
): ToolDefinition<T> {
  const originalExecute = def.execute;

  def.execute = async (
    params: z.infer<T>,
    ctx: ToolContext,
  ): Promise<ToolResult> => {
    try {
      def.parameters.parse(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map((i) => `"${i.path.join(".")}": ${i.message}`)
          .join(", ");
        return {
          output: `Invalid arguments for ${def.name}: ${issues}`,
          isError: true,
        };
      }
      throw error;
    }
    return originalExecute(params, ctx);
  };

  return def;
}
