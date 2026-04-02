import type { ProviderRegistry } from "@mineco/provider";
import { describe, expect, it } from "vitest";
import type { AgentDefinition } from "../../src/agents/types.js";
import { createAgentTool } from "../../src/tools/agent.js";
import type { ToolContext } from "../../src/tools/types.js";
import {
  finishChunk,
  mockProvider,
  textChunk,
} from "../helper/mock-provider.js";

function makeDefinitions(
  ...defs: Array<{ type: string; toolNames: string[]; maxSteps: number }>
): Map<string, AgentDefinition> {
  const map = new Map<string, AgentDefinition>();
  for (const d of defs) {
    map.set(d.type, {
      type: d.type,
      description: `${d.type} agent`,
      systemPrompt: `You are a ${d.type} agent.`,
      toolNames: d.toolNames,
      maxSteps: d.maxSteps,
    });
  }
  return map;
}

function makeToolContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDir: "/tmp",
    ...overrides,
  };
}

function makeSessionStore() {
  const runs: Array<{
    id: string;
    status: "running" | "completed" | "error";
    summary: string | null;
    completedAt: number | null;
  }> = [];

  return {
    create: async () => ({
      id: "s1",
      title: "t",
      workspaceId: "w1",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    get: async () => undefined,
    list: async () => [],
    listByWorkspace: async () => [],
    addMessage: async () => {},
    updateMessages: async () => {},
    updateTitle: async () => {},
    delete: async () => {},
    createRun: async (run: { id: string }) => {
      runs.push({
        id: run.id,
        status: "running",
        summary: null,
        completedAt: null,
      });
    },
    updateRun: async (
      runId: string,
      updates: {
        status?: "running" | "completed" | "error";
        summary?: string | null;
        completedAt?: number | null;
      },
    ) => {
      const run = runs.find((r) => r.id === runId);
      if (run) {
        if (updates.status !== undefined) run.status = updates.status;
        if (updates.summary !== undefined) run.summary = updates.summary;
        if (updates.completedAt !== undefined)
          run.completedAt = updates.completedAt;
      }
    },
    getRunsBySession: async () => [],
    _runs: runs,
  };
}

describe("Agent Tool", () => {
  it("returns error for unknown agent type", async () => {
    const provider = mockProvider([]);
    const registry = {
      get: () => provider,
      acquireRateLimit: async () => {},
    } as unknown as ProviderRegistry;
    const definitions = makeDefinitions({
      type: "explore",
      toolNames: ["read_file"],
      maxSteps: 5,
    });
    const sessionStore = makeSessionStore();

    const tool = createAgentTool({
      providerRegistry: registry,
      definitions,
      sessionStore,
    });
    const result = await tool.execute(
      { agent_type: "nonexistent", prompt: "test" },
      makeToolContext(),
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain("Unknown agent type");
    expect(result.output).toContain("nonexistent");
  });

  it("returns error immediately when signal is already aborted", async () => {
    const provider = mockProvider([]);
    const registry = {
      get: () => provider,
      acquireRateLimit: async () => {},
    } as unknown as ProviderRegistry;
    const definitions = makeDefinitions({
      type: "explore",
      toolNames: ["read_file"],
      maxSteps: 5,
    });
    const sessionStore = makeSessionStore();

    const tool = createAgentTool({
      providerRegistry: registry,
      definitions,
      sessionStore,
    });
    const controller = new AbortController();
    controller.abort();

    const result = await tool.execute(
      { agent_type: "explore", prompt: "test" },
      makeToolContext({ signal: controller.signal }),
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain("Aborted");
  });

  it("emits subagent-start and subagent-end events", async () => {
    const provider = mockProvider([
      textChunk("Found 3 files"),
      finishChunk("stop"),
    ]);
    const registry = {
      get: () => provider,
      acquireRateLimit: async () => {},
    } as unknown as ProviderRegistry;
    const definitions = makeDefinitions({
      type: "explore",
      toolNames: ["read_file"],
      maxSteps: 5,
    });
    const sessionStore = makeSessionStore();

    const events: Array<{ type: string; runId?: string }> = [];
    const tool = createAgentTool({
      providerRegistry: registry,
      definitions,
      sessionStore,
    });

    const result = await tool.execute(
      { agent_type: "explore", prompt: "find files" },
      makeToolContext({
        emitEvent: async (event) => {
          events.push(event as { type: string; runId?: string });
        },
      }),
    );

    expect(result.isError).toBeUndefined();
    expect(result.output).toContain("Found 3 files");

    const startEvent = events.find((e) => e.type === "subagent-start");
    const endEvent = events.find((e) => e.type === "subagent-end");
    expect(startEvent).toBeDefined();
    expect(endEvent).toBeDefined();
    expect(startEvent?.runId).toBe(endEvent?.runId);
  });

  it("handles inner loop error gracefully", async () => {
    const provider = {
      id: "test",
      name: "test",
      chatStream: async function* (_req: unknown) {
        yield { delta: {} };
        throw new Error("LLM API error");
      },
      chat: () => {
        throw new Error("not impl");
      },
      listModels: () => [],
    } as never;

    const registry = {
      get: () => provider,
      acquireRateLimit: async () => {},
    } as unknown as ProviderRegistry;
    const definitions = makeDefinitions({
      type: "explore",
      toolNames: ["read_file"],
      maxSteps: 5,
    });
    const sessionStore = makeSessionStore();

    const events: Array<{ type: string; summary?: string }> = [];
    const tool = createAgentTool({
      providerRegistry: registry,
      definitions,
      sessionStore,
    });

    const result = await tool.execute(
      { agent_type: "explore", prompt: "search" },
      makeToolContext({
        emitEvent: async (event) => {
          events.push(event as { type: string; summary?: string });
        },
      }),
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain("LLM API error");

    const endEvent = events.find((e) => e.type === "subagent-end");
    expect(endEvent).toBeDefined();
    expect(endEvent?.summary).toContain("LLM API error");
  });

  it("persists run with correct status on completion", async () => {
    const provider = mockProvider([
      textChunk("Explored code"),
      finishChunk("stop"),
    ]);
    const registry = {
      get: () => provider,
      acquireRateLimit: async () => {},
    } as unknown as ProviderRegistry;
    const definitions = makeDefinitions({
      type: "explore",
      toolNames: ["read_file"],
      maxSteps: 5,
    });
    const sessionStore = makeSessionStore();

    const tool = createAgentTool({
      providerRegistry: registry,
      definitions,
      sessionStore,
    });
    await tool.execute(
      { agent_type: "explore", prompt: "search" },
      makeToolContext(),
    );

    const runs = sessionStore._runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("completed");
    expect(runs[0]?.summary).toContain("Explored code");
    expect(runs[0]?.completedAt).not.toBeNull();
  });
});
