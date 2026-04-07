import { bashTool } from "./bash.js";
import { editTool } from "./edit.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { lsTool } from "./ls.js";
import { readFileTool } from "./read.js";
import { ToolRegistry } from "./registry.js";
import { writeFileTool } from "./write.js";

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(bashTool);
  registry.register(grepTool);
  registry.register(globTool);
  registry.register(editTool);
  registry.register(lsTool);
  return registry;
}

export { defineTool } from "./define.js";
export type {
  PermissionDecision,
  PermissionRequest,
  ToolRisk,
} from "./permission.js";
export { checkPermission } from "./permission.js";
export { ToolRegistry } from "./registry.js";
export type { ToolContext, ToolDefinition, ToolResult } from "./types.js";
