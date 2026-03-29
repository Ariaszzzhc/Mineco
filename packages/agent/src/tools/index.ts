import { ToolRegistry } from "./registry.js";
import { readFileTool } from "./read.js";
import { writeFileTool } from "./write.js";
import { bashTool } from "./bash.js";

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(bashTool);
  return registry;
}

export { ToolRegistry } from "./registry.js";
export { defineTool } from "./define.js";
export type { ToolDefinition, ToolContext, ToolResult } from "./types.js";
