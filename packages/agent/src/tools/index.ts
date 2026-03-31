import { bashTool } from "./bash.js";
import { readFileTool } from "./read.js";
import { ToolRegistry } from "./registry.js";
import { writeFileTool } from "./write.js";

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(bashTool);
  return registry;
}

export { defineTool } from "./define.js";
export { ToolRegistry } from "./registry.js";
export type { ToolContext, ToolDefinition, ToolResult } from "./types.js";
