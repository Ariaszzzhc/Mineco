import { describe, expect, it } from "vitest";
import { MiniMaxProvider } from "../src/adapters/minimax.js";
import type { ChatRequest, ChatResponse, ChatStreamChunk } from "../src/types.js";
import { hasSubscription } from "../src/provider.js";

function createProvider(config?: { apiKey?: string; platform?: "cn" | "intl" }) {
  const { apiKey = "test-key", ...rest } = config ?? {};
  return new MiniMaxProvider({
    apiKey,
    ...("platform" in rest ? { platform: rest.platform } : {}),
  });
}

function callTransformRequest(provider: MiniMaxProvider, req: Partial<ChatRequest>) {
  return (provider as unknown as { transformRequest: (r: ChatRequest) => unknown }).transformRequest({
    model: "MiniMax-M2.7",
    messages: [{ role: "user", content: "Hello" }],
    ...req,
  });
}

function callTransformResponse(provider: MiniMaxProvider, raw: unknown): ChatResponse {
  return (provider as unknown as { transformResponse: (r: unknown) => ChatResponse }).transformResponse(raw);
}

function callTransformStreamChunk(provider: MiniMaxProvider, raw: unknown): ChatStreamChunk | null {
  return (provider as unknown as { transformStreamChunk: (r: unknown) => ChatStreamChunk | null }).transformStreamChunk(raw);
}

describe("MiniMaxProvider", () => {
  describe("constructor", () => {
    it("should accept string config (backward compatible)", () => {
      const provider = new MiniMaxProvider("test-key");
      expect(provider.id).toBe("minimax");
      expect(provider.name).toBe("MiniMax");
    });

    it("should default to intl platform", () => {
      const provider = createProvider();
      expect(provider.id).toBe("minimax");
    });

    it("should accept cn platform", () => {
      const provider = createProvider({ platform: "cn" });
      expect(provider.id).toBe("minimax");
    });

    it("should not have subscription", () => {
      const provider = createProvider();
      expect(hasSubscription(provider)).toBe(false);
    });
  });

  describe("listModels", () => {
    it("should list all 7 models", () => {
      const provider = createProvider();
      const models = provider.listModels();
      expect(models.length).toBe(7);
      expect(models.map((m) => m.id)).toContain("MiniMax-M2.7");
      expect(models.map((m) => m.id)).toContain("MiniMax-M2.7-highspeed");
      expect(models.map((m) => m.id)).toContain("MiniMax-M2.5");
      expect(models.map((m) => m.id)).toContain("MiniMax-M2.5-highspeed");
      expect(models.map((m) => m.id)).toContain("MiniMax-M2.1");
      expect(models.map((m) => m.id)).toContain("MiniMax-M2.1-highspeed");
      expect(models.map((m) => m.id)).toContain("MiniMax-M2");
    });

    it("should have correct pricing for standard models", () => {
      const provider = createProvider();
      const m27 = provider.listModels().find((m) => m.id === "MiniMax-M2.7")!;
      expect(m27.pricing).toEqual({ inputPerMillion: 0.3, outputPerMillion: 1.2 });
    });

    it("should have correct pricing for highspeed models", () => {
      const provider = createProvider();
      const m27h = provider.listModels().find((m) => m.id === "MiniMax-M2.7-highspeed")!;
      expect(m27h.pricing).toEqual({ inputPerMillion: 0.6, outputPerMillion: 2.4 });
    });

    it("should have consistent model metadata", () => {
      const provider = createProvider();
      for (const model of provider.listModels()) {
        expect(model.maxOutputTokens).toBe(131072);
        expect(model.contextWindow).toBe(204800);
        expect(model.supportsVision).toBe(false);
        expect(model.supportsToolCalling).toBe(true);
        expect(model.supportsStreaming).toBe(true);
      }
    });
  });

  describe("transformRequest", () => {
    it("should set reasoning_split to true", () => {
      const provider = createProvider();
      const body = callTransformRequest(provider, {}) as Record<string, unknown>;
      expect(body.reasoning_split).toBe(true);
    });

    it("should include model and messages", () => {
      const provider = createProvider();
      const body = callTransformRequest(provider, {}) as Record<string, unknown>;
      expect(body.model).toBe("MiniMax-M2.7");
      expect(body.messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("should include tools when provided", () => {
      const provider = createProvider();
      const body = callTransformRequest(provider, {
        tools: [{ name: "get_weather", description: "Get weather", parameters: { type: "object" } }],
      }) as Record<string, unknown>;
      expect(body.tools).toBeDefined();
      expect((body.tools as unknown[]).length).toBe(1);
    });
  });

  describe("transformResponse", () => {
    it("should handle response without reasoning_details", () => {
      const provider = createProvider();
      const result = callTransformResponse(provider, {
        id: "chat-1",
        model: "MiniMax-M2.7",
        choices: [{
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: "Hello!" },
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      expect(result.id).toBe("chat-1");
      expect(result.message.content).toBe("Hello!");
      expect(result.finishReason).toBe("stop");
      expect(result.usage.totalTokens).toBe(15);
    });

    it("should prepend thinking from reasoning_details", () => {
      const provider = createProvider();
      const result = callTransformResponse(provider, {
        id: "chat-2",
        model: "MiniMax-M2.7",
        choices: [{
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "The answer is 42.",
            reasoning_details: [{ text: "Let me calculate..." }],
          },
        }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      });

      expect(result.message.content).toBe(
        "<thinking>\nLet me calculate...\n</thinking>\n\nThe answer is 42.",
      );
    });

    it("should handle tool calls", () => {
      const provider = createProvider();
      const result = callTransformResponse(provider, {
        id: "chat-3",
        model: "MiniMax-M2.7",
        choices: [{
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_1",
              function: { name: "get_weather", arguments: '{"city":"Shanghai"}' },
            }],
          },
        }],
        usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 },
      });

      expect(result.finishReason).toBe("tool_calls");
      expect(result.message.toolCalls).toEqual([
        { id: "call_1", name: "get_weather", arguments: '{"city":"Shanghai"}' },
      ]);
    });

    it("should handle empty reasoning_details", () => {
      const provider = createProvider();
      const result = callTransformResponse(provider, {
        id: "chat-4",
        model: "MiniMax-M2.7",
        choices: [{
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "Hi",
            reasoning_details: [],
          },
        }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      });

      expect(result.message.content).toBe("Hi");
    });

    it("should default missing usage to zeros", () => {
      const provider = createProvider();
      const result = callTransformResponse(provider, {
        id: "chat-5",
        model: "MiniMax-M2.7",
        choices: [{
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: "ok" },
        }],
      });

      expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    });
  });

  describe("transformStreamChunk", () => {
    it("should parse content delta", () => {
      const provider = createProvider();
      const result = callTransformStreamChunk(provider, {
        choices: [{
          index: 0,
          delta: { content: "Hello" },
          finish_reason: null,
        }],
      });

      expect(result?.delta.content).toBe("Hello");
      expect(result?.delta.thinking).toBeUndefined();
      expect(result?.finishReason).toBeNull();
    });

    it("should diff reasoning_details incrementally", () => {
      const provider = createProvider();

      // First chunk: full text "Hello"
      const chunk1 = callTransformStreamChunk(provider, {
        choices: [{
          index: 0,
          delta: { reasoning_details: [{ text: "Hello" }] },
          finish_reason: null,
        }],
      });
      expect(chunk1?.delta.thinking).toBe("Hello");

      // Second chunk: cumulative "Hello World"
      const chunk2 = callTransformStreamChunk(provider, {
        choices: [{
          index: 0,
          delta: { reasoning_details: [{ text: "Hello World" }] },
          finish_reason: null,
        }],
      });
      expect(chunk2?.delta.thinking).toBe(" World");
    });

    it("should reset reasoning buffer on stream end", () => {
      const provider = createProvider();

      // Build up some buffer
      callTransformStreamChunk(provider, {
        choices: [{ index: 0, delta: { reasoning_details: [{ text: "thinking" }] }, finish_reason: null }],
      });

      // Stream end
      const endChunk = callTransformStreamChunk(provider, {
        choices: [{ index: 0, delta: { content: "done" }, finish_reason: "stop" }],
      });
      expect(endChunk?.finishReason).toBe("stop");

      // Next stream should start fresh
      const newChunk = callTransformStreamChunk(provider, {
        choices: [{ index: 0, delta: { reasoning_details: [{ text: "new thought" }] }, finish_reason: null }],
      });
      expect(newChunk?.delta.thinking).toBe("new thought");
    });

    it("should handle tool calls in stream", () => {
      const provider = createProvider();
      const result = callTransformStreamChunk(provider, {
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0,
              id: "call_1",
              function: { name: "search", arguments: '{"q":"test"}' },
            }],
          },
          finish_reason: null,
        }],
      });

      expect(result?.delta.toolCalls).toEqual([
        { index: 0, id: "call_1", name: "search", arguments: '{"q":"test"}' },
      ]);
    });

    it("should parse usage in stream chunk", () => {
      const provider = createProvider();
      const result = callTransformStreamChunk(provider, {
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      expect(result?.usage).toEqual({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    });

    it("should return null for empty choices", () => {
      const provider = createProvider();
      const result = callTransformStreamChunk(provider, { choices: [] });
      expect(result).toBeNull();
    });

    it("should return null for missing delta", () => {
      const provider = createProvider();
      const result = callTransformStreamChunk(provider, {
        choices: [{ index: 0 }],
      });
      expect(result).toBeNull();
    });

    it("should skip reasoning_details when text is empty", () => {
      const provider = createProvider();
      const result = callTransformStreamChunk(provider, {
        choices: [{
          index: 0,
          delta: { reasoning_details: [{ text: "" }] },
          finish_reason: null,
        }],
      });
      expect(result?.delta.thinking).toBeUndefined();
    });
  });
});
