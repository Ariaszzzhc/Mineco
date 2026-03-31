import type { ProviderRegistry } from "@mineco/provider";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AgentLoop } from "../src/loop.js";
import type { Session } from "../src/session/types.js";
import { ToolRegistry } from "../src/tools/registry.js";
import type { AgentConfig } from "../src/types.js";
import {
  finishChunk,
  mockProvider,
  textChunk,
  thinkingChunk,
  toolCallDelta,
} from "./helper/mock-provider.js";

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    providerId: "test",
    model: "test-model",
    systemPrompt: "You are a test assistant.",
    workingDir: "/tmp",
    maxSteps: 5,
    ...overrides,
  };
}

function makeSession(messages?: Session["messages"]): Session {
  return {
    id: "sess-1",
    title: "Test",
    workspaceId: "ws-1",
    messages: messages ?? [
      { id: "m1", role: "user", content: "hello", createdAt: Date.now() },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Collect all events from the agent loop into an array */
async function collectEvents(
  loop: AgentLoop,
  session: Session,
  config: AgentConfig,
) {
  const events = [];
  for await (const event of loop.run(session, config)) {
    events.push(event);
  }
  return events;
}

function makeRegistry(provider: ReturnType<typeof mockProvider>) {
  return { get: () => provider } as unknown as ProviderRegistry;
}

/** Register a minimal tool with real Zod schema */
function registerEcho(registry: ToolRegistry, name = "echo") {
  registry.register({
    name,
    description: `${name} tool`,
    parameters: z.object({ input: z.string().optional() }),
    execute: async () => ({ output: `${name}-result` }),
  });
}

describe("AgentLoop", () => {
  describe("pure text completion", () => {
    it("yields step → text-deltas → usage → complete:stop", async () => {
      const provider = mockProvider([
        textChunk("Hello"),
        textChunk(" world"),
        finishChunk("stop", {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        }),
      ]);

      const loop = new AgentLoop(makeRegistry(provider), new ToolRegistry());
      const events = await collectEvents(loop, makeSession(), makeConfig());

      expect(events).toEqual(
        expect.arrayContaining([
          { type: "step", step: 1, maxSteps: 5 },
          { type: "text-delta", delta: "Hello" },
          { type: "text-delta", delta: " world" },
          {
            type: "usage",
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          },
          { type: "complete", reason: "stop" },
        ]),
      );
    });

    it("accumulates text across multiple chunks", async () => {
      const provider = mockProvider([
        textChunk("A"),
        textChunk("B"),
        textChunk("C"),
        finishChunk("stop"),
      ]);

      const loop = new AgentLoop(makeRegistry(provider), new ToolRegistry());
      const events = await collectEvents(loop, makeSession(), makeConfig());
      const deltas = events
        .filter((e) => e.type === "text-delta")
        .map((e) => (e as { delta: string }).delta);
      expect(deltas).toEqual(["A", "B", "C"]);
    });
  });

  describe("tool call loop", () => {
    it("executes tool and continues the loop", async () => {
      const provider = mockProvider(
        [
          toolCallDelta(0, {
            id: "tc1",
            name: "echo",
            arguments: '{"input":"x"}',
          }),
          finishChunk("tool_calls"),
        ],
        [textChunk("Done"), finishChunk("stop")],
      );

      const toolReg = new ToolRegistry();
      registerEcho(toolReg);

      const loop = new AgentLoop(makeRegistry(provider), toolReg);
      const events = await collectEvents(loop, makeSession(), makeConfig());

      const types = events.map((e) => e.type);
      expect(types).toEqual([
        "step",
        "tool-call",
        "tool-result",
        "step",
        "text-delta",
        "complete",
      ]);
    });

    it("yields tool-call and tool-result events with correct data", async () => {
      const provider = mockProvider(
        [
          toolCallDelta(0, {
            id: "tc1",
            name: "echo",
            arguments: '{"input":"hi"}',
          }),
          finishChunk("tool_calls"),
        ],
        [finishChunk("stop")],
      );

      const toolReg = new ToolRegistry();
      registerEcho(toolReg);

      const loop = new AgentLoop(makeRegistry(provider), toolReg);
      const events = await collectEvents(loop, makeSession(), makeConfig());

      const toolCall = events.find((e) => e.type === "tool-call")!;
      expect(toolCall).toMatchObject({
        type: "tool-call",
        toolCallId: "tc1",
        toolName: "echo",
        args: { input: "hi" },
      });

      const toolResult = events.find((e) => e.type === "tool-result")!;
      expect(toolResult).toMatchObject({
        type: "tool-result",
        toolCallId: "tc1",
        toolName: "echo",
        result: "echo-result",
        isError: false,
      });
    });

    it("handles multiple tool calls in one step", async () => {
      const provider = mockProvider(
        [
          toolCallDelta(0, { id: "tc1", name: "a", arguments: "{}" }),
          toolCallDelta(1, { id: "tc2", name: "b", arguments: "{}" }),
          finishChunk("tool_calls"),
        ],
        [finishChunk("stop")],
      );

      const toolReg = new ToolRegistry();
      registerEcho(toolReg, "a");
      registerEcho(toolReg, "b");

      const loop = new AgentLoop(makeRegistry(provider), toolReg);
      const events = await collectEvents(loop, makeSession(), makeConfig());

      const calls = events.filter((e) => e.type === "tool-call");
      const results = events.filter((e) => e.type === "tool-result");
      expect(calls).toHaveLength(2);
      expect(results).toHaveLength(2);
    });
  });

  describe("partial tool call assembly", () => {
    it("accumulates arguments across multiple chunks by index", async () => {
      const provider = mockProvider(
        [
          toolCallDelta(0, { id: "tc1", name: "echo" }),
          toolCallDelta(0, { arguments: '{"in' }),
          toolCallDelta(0, { arguments: 'put":"x"}' }),
          finishChunk("tool_calls"),
        ],
        [finishChunk("stop")],
      );

      const toolReg = new ToolRegistry();
      registerEcho(toolReg);

      const loop = new AgentLoop(makeRegistry(provider), toolReg);
      const events = await collectEvents(loop, makeSession(), makeConfig());

      const toolCall = events.find((e) => e.type === "tool-call")!;
      expect((toolCall as { args: unknown }).args).toEqual({ input: "x" });
    });
  });

  describe("max steps", () => {
    it("stops at maxSteps with complete:max-steps", async () => {
      const provider = mockProvider(
        [
          toolCallDelta(0, { id: "tc1", name: "echo", arguments: "{}" }),
          finishChunk("tool_calls"),
        ],
        [
          toolCallDelta(0, { id: "tc2", name: "echo", arguments: "{}" }),
          finishChunk("tool_calls"),
        ],
        [
          toolCallDelta(0, { id: "tc3", name: "echo", arguments: "{}" }),
          finishChunk("tool_calls"),
        ],
      );

      const toolReg = new ToolRegistry();
      registerEcho(toolReg);

      const loop = new AgentLoop(makeRegistry(provider), toolReg);
      const events = await collectEvents(
        loop,
        makeSession(),
        makeConfig({ maxSteps: 3 }),
      );

      const complete = events.find((e) => e.type === "complete")!;
      expect(complete).toMatchObject({ type: "complete", reason: "max-steps" });
    });
  });

  describe("thinking deltas", () => {
    it("yields thinking-delta events from stream", async () => {
      const provider = mockProvider([
        thinkingChunk("Let me"),
        thinkingChunk(" think..."),
        textChunk("Answer"),
        finishChunk("stop"),
      ]);

      const loop = new AgentLoop(makeRegistry(provider), new ToolRegistry());
      const events = await collectEvents(loop, makeSession(), makeConfig());

      const thinkingDeltas = events.filter((e) => e.type === "thinking-delta");
      expect(thinkingDeltas).toEqual([
        { type: "thinking-delta", delta: "Let me" },
        { type: "thinking-delta", delta: " think..." },
      ]);
    });

    it("yields thinking before text in event order", async () => {
      const provider = mockProvider([
        thinkingChunk("reasoning"),
        textChunk("answer"),
        finishChunk("stop"),
      ]);

      const loop = new AgentLoop(makeRegistry(provider), new ToolRegistry());
      const events = await collectEvents(loop, makeSession(), makeConfig());

      const types = events.map((e) => e.type);
      expect(types).toEqual([
        "step",
        "thinking-delta",
        "text-delta",
        "complete",
      ]);
    });
  });

  describe("error handling", () => {
    it("yields error event when provider.chatStream throws", async () => {
      const provider: ReturnType<typeof mockProvider> = {
        id: "test",
        name: "test",
        // biome-ignore lint/correctness/useYield: intentionally throws before yielding
        chatStream: async function* (_req: unknown) {
          throw new Error("stream failed");
        },
        chat: () => {
          throw new Error("not impl");
        },
        listModels: () => [],
      } as never;

      const loop = new AgentLoop(makeRegistry(provider), new ToolRegistry());
      const events = await collectEvents(loop, makeSession(), makeConfig());

      expect(events).toEqual(
        expect.arrayContaining([
          { type: "step", step: 1, maxSteps: 5 },
          { type: "error", error: "stream failed" },
        ]),
      );
      expect(events.find((e) => e.type === "complete")).toBeUndefined();
    });

    it("propagates error when provider not found in registry", async () => {
      const registry = {
        get: () => {
          throw new Error('Provider "missing" not found');
        },
      } as unknown as ProviderRegistry;

      const loop = new AgentLoop(registry, new ToolRegistry());
      await expect(
        collectEvents(loop, makeSession(), makeConfig()),
      ).rejects.toThrow('Provider "missing" not found');
    });
  });
});
