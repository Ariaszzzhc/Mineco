/**
 * Context assembly — composes the per-turn injection context (EDD §6.1).
 *
 * `assembleContext({ workspaceId, agentId, mode })` is the single place where
 * the three orthogonal injection sources are gathered:
 *
 *   1. Global instructions (`~/.mineco/MINECO.md`)
 *   2. Workspace memory block (budget-capped, assembled from per-workspace .md files)
 *   3. MCP servers (merged from global + project + local scopes)
 *
 * The result is passed into `EngineRunInput` so the Claude adapter can inject
 * global instructions + memory as system-prompt `append`, and forward MCP
 * servers as the `mcpServers` option.
 *
 * This module has no side-effects and no direct DB access — it delegates to the
 * three specialist services and composes their outputs. (Skills are a M3 addition;
 * the slot is present but returns empty for now.)
 */

import type { McpServerEntry } from "../../src/lib/agent-protocol";
import { readGlobalInstructions } from "./global-instructions";
import { listMcp, toEngineServers } from "./mcp";
import { assembleMemoryBlock } from "./memory";

export interface AssembledContext {
  /** Contents of `~/.mineco/MINECO.md` (empty string when not set). */
  globalInstructions: string;
  /** Budget-capped markdown block from workspace memory (empty string when none). */
  memory: string;
  /** Effective MCP server list (enabled, non-overridden, ready for adapter). */
  mcpServers: McpServerEntry[];
}

/**
 * Assembles the injection context for one turn.
 *
 * @param workspaceId — the workspace whose MCP servers and memory to inject
 *   (null = public/global).
 */
export async function assembleContext(input: {
  workspaceId: string | null;
}): Promise<AssembledContext> {
  const [instructionsResult, memoryBlock, mcpAll] = await Promise.all([
    readGlobalInstructions(),
    assembleMemoryBlock(input.workspaceId),
    listMcp(input.workspaceId),
  ]);

  return {
    globalInstructions: instructionsResult.text,
    memory: memoryBlock,
    mcpServers: toEngineServers(mcpAll),
  };
}
