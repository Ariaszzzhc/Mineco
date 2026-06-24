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
 * The result is passed into `EngineSessionInit` so the Claude adapter can inject
 * global instructions + memory as system-prompt `append`, and forward MCP
 * servers as the `mcpServers` option.
 *
 * This module has no side-effects and no direct DB access — it delegates to the
 * three specialist services and composes their outputs. (Skills are a M3 addition;
 * the slot is present but returns empty for now.)
 */

import type { McpServerEntry } from "@/shared/agent-protocol";
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
 * @param memoryMode — the engine's memory capability (ADR-0.4-6). For
 *   `"native-dir"` (Claude) the engine reads/writes its own auto-memory dir via
 *   the ADR-0.4-3 symlink, so mineco STOPS injecting and `memory` stays empty.
 *   `assembleMemoryBlock` is invoked ONLY for `"inject-only"` engines (which is
 *   also the per-agent-isolation fallback from ADR-0.4-8). For an engine with no
 *   memory at all (`"none"`) nothing is injected either.
 */
export async function assembleContext(input: {
  workspaceId: string | null;
  memoryMode: "native-dir" | "inject-only" | "none";
}): Promise<AssembledContext> {
  const [instructionsResult, memoryBlock, mcpAll] = await Promise.all([
    readGlobalInstructions(),
    input.memoryMode === "inject-only"
      ? assembleMemoryBlock(input.workspaceId)
      : Promise.resolve(""),
    listMcp(input.workspaceId),
  ]);

  return {
    globalInstructions: instructionsResult.text,
    memory: memoryBlock,
    mcpServers: toEngineServers(mcpAll),
  };
}
