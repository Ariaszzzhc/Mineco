import { randomUUID } from "node:crypto";
import type { ProviderRegistry } from "@mineco/provider";
import { z } from "zod";
import type { AgentDefinition } from "../agents/types.js";
import { AgentLoop } from "../loop.js";
import type { Session, SessionStore, SubagentRun } from "../session/types.js";
import type { AgentConfig, AgentEvent } from "../types.js";
import { bashTool } from "./bash.js";
import { defineTool } from "./define.js";
import { editTool } from "./edit.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { lsTool } from "./ls.js";
import { readFileTool } from "./read.js";
import { ToolRegistry } from "./registry.js";
import type { ToolContext, ToolDefinition } from "./types.js";
import { writeFileTool } from "./write.js";

const AgentToolSchema = z.object({
  agent_type: z.string().describe("The type of subagent to run"),
  prompt: z.string().describe("The task description for the subagent"),
});

const ALL_TOOLS = [
  readFileTool,
  writeFileTool,
  bashTool,
  grepTool,
  globTool,
  editTool,
  lsTool,
];

export function createAgentTool(deps: {
  providerRegistry: ProviderRegistry;
  definitions: Map<string, AgentDefinition>;
  sessionStore: SessionStore;
}): ToolDefinition {
  return defineTool({
    name: "agent",
    description: buildAgentToolDescription(deps.definitions),
    parameters: AgentToolSchema,
    isConcurrencySafe: () => true,
    execute: async (params, ctx) => {
      if (ctx.signal?.aborted) {
        return { output: "Aborted before execution started", isError: true };
      }

      const definition = deps.definitions.get(params.agent_type);
      if (!definition) {
        return {
          output: `Unknown agent type: "${params.agent_type}". Available types: ${[...deps.definitions.keys()].join(", ")}`,
          isError: true,
        };
      }

      const runId = randomUUID();
      const filteredRegistry = createFilteredRegistry(definition.toolNames);

      await emit(ctx, {
        type: "subagent-start",
        runId,
        agentType: definition.type,
      });

      const run: SubagentRun = {
        id: runId,
        sessionId: ctx.sessionId ?? "",
        parentToolCallId: "",
        agentType: definition.type,
        status: "running",
        summary: null,
        createdAt: Date.now(),
        completedAt: null,
      };

      try {
        await deps.sessionStore.createRun(run);
      } catch {
        // Run persistence is best-effort
      }

      const syntheticSession: Session = {
        id: ctx.sessionId ?? randomUUID(),
        title: `Subagent: ${definition.type}`,
        workspaceId: "",
        messages: [
          {
            id: randomUUID(),
            role: "user",
            content: params.prompt,
            createdAt: Date.now(),
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const innerConfig: AgentConfig = {
        providerId: ctx.providerId ?? "",
        model: ctx.model ?? "",
        systemPrompt: definition.systemPrompt,
        workingDir: ctx.workingDir,
        maxSteps: definition.maxSteps,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        ...(ctx.requestPermission
          ? { requestPermission: ctx.requestPermission }
          : {}),
      };

      let summary = "";
      let innerError: string | null = null;
      const innerLoop = new AgentLoop(deps.providerRegistry, filteredRegistry);

      try {
        for await (const innerEvent of innerLoop.run(
          syntheticSession,
          innerConfig,
        )) {
          await emit(ctx, {
            type: "subagent-event",
            runId,
            event: innerEvent,
          });

          if (innerEvent.type === "text-delta") {
            summary += innerEvent.delta;
          }

          if (innerEvent.type === "error") {
            innerError = innerEvent.error;
          }

          if (innerEvent.type === "complete") {
            break;
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        innerError = message;
      }

      if (innerError) {
        await emit(ctx, { type: "subagent-end", runId, summary: innerError });

        try {
          await deps.sessionStore.updateRun(runId, {
            status: "error",
            summary: innerError,
            completedAt: Date.now(),
          });
        } catch {
          // Best-effort
        }

        return { output: innerError, isError: true };
      }

      if (!summary.trim()) {
        summary = "(No output from subagent)";
      }

      await emit(ctx, { type: "subagent-end", runId, summary });

      try {
        await deps.sessionStore.updateRun(runId, {
          status: "completed",
          summary,
          completedAt: Date.now(),
        });
      } catch {
        // Best-effort
      }

      return { output: summary };
    },
  });
}

function createFilteredRegistry(toolNames: string[]): ToolRegistry {
  const filtered = new ToolRegistry();

  for (const tool of ALL_TOOLS) {
    if (tool.name === "agent") continue;
    if (toolNames.includes(tool.name)) {
      filtered.register(tool);
    }
  }

  return filtered;
}

function buildAgentToolDescription(
  definitions: Map<string, AgentDefinition>,
): string {
  const agentList = [...definitions.values()]
    .map((d) => `- "${d.type}": ${d.description}`)
    .join("\n");

  return `Spawn a subagent to perform a specific task. The subagent runs independently and returns its results.

Available agent types:
${agentList}

Use subagents when:
- You need to research or explore code before making changes
- You want to delegate a specific, well-defined task
- You need parallel investigation of different parts of the codebase`;
}

async function emit(ctx: ToolContext, event: AgentEvent): Promise<void> {
  await ctx.emitEvent?.(event);
}
