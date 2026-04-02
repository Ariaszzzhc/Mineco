// Agent loop

// Agents
export { agentDefinitions } from "./agents/index.js";
export type { AgentDefinition } from "./agents/types.js";
export { AgentLoop } from "./loop.js";
// Prompt
export { buildSystemPrompt } from "./prompt.js";
// Session
export type {
  Session,
  SessionMessage,
  SessionStore,
  SubagentRun,
} from "./session/types.js";
// Tools
export { createAgentTool } from "./tools/agent.js";
export type { ToolContext, ToolDefinition, ToolResult } from "./tools/index.js";
export {
  createDefaultToolRegistry,
  defineTool,
  ToolRegistry,
} from "./tools/index.js";
// Context management
export { microCompact } from "./context/micro-compact.js";
export type { CompactResult, CompactStats, MicroCompactOptions } from "./context/micro-compact.js";
export { ContextManager, DEFAULT_CONFIG, injectNotesIntoPrompt } from "./context/manager.js";
export type { CompressionStats, ContextManagerConfig, ContextManagerResult } from "./context/manager.js";
export { extractSessionNotes } from "./context/session-memory.js";
export type { ExtractedNotes } from "./context/session-memory.js";
export { estimateMessagesTokens, estimateMessageTokens, estimateSessionTokens, estimateTokens } from "./context/token-estimator.js";
// Types
export type { AgentConfig, AgentEvent } from "./types.js";
