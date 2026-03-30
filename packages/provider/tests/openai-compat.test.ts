import { describe, expect, it, vi } from "vitest";
import { OpenAICompatAdapter } from "../src/adapters/openai-compat";
import type { ChatRequest, ChatResponse } from "../src/types";

const MOCK_MODELS = [
  {
    id: "test-model",
    name: "Test Model",
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsToolCalling: true,
    supportsStreaming: true,
  },
];

function createAdapter() {
  return new OpenAICompatAdapter({
    id: "test",
    name: "Test",
    baseURL: "https://api.test.com/v1",
    headers: { Authorization: "Bearer test-key" },
    models: MOCK_MODELS,
  });
}

describe("OpenAICompatAdapter", () => {
  it("should list models", () => {
    const adapter = createAdapter();
    expect(adapter.listModels()).toEqual(MOCK_MODELS);
  });

  it("should transform request correctly", () => {
    const adapter = createAdapter();
    const req: ChatRequest = {
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.7,
    };

    // Access protected method via type assertion
    const transformed = (
      adapter as unknown as {
        transformRequest: (req: ChatRequest) => unknown;
      }
    ).transformRequest(req);

    const body = transformed as Record<string, unknown>;
    expect(body["model"]).toBe("test-model");
    expect(body["temperature"]).toBe(0.7);
    expect(body["stream"]).toBeUndefined();
    expect(body["messages"]).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("should transform response correctly", () => {
    const adapter = createAdapter();
    const raw = {
      id: "chat-123",
      model: "test-model",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: "Hi there!" },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    };

    const transformed = (
      adapter as unknown as {
        transformResponse: (raw: unknown) => ChatResponse;
      }
    ).transformResponse(raw);

    expect(transformed.id).toBe("chat-123");
    expect(transformed.model).toBe("test-model");
    expect(transformed.message.content).toBe("Hi there!");
    expect(transformed.finishReason).toBe("stop");
    expect(transformed.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it("should transform response with tool calls", () => {
    const adapter = createAdapter();
    const raw = {
      id: "chat-456",
      model: "test-model",
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"city":"Beijing"}',
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    };

    const transformed = (
      adapter as unknown as {
        transformResponse: (raw: unknown) => ChatResponse;
      }
    ).transformResponse(raw);

    expect(transformed.finishReason).toBe("tool_calls");
    expect(transformed.message.toolCalls).toEqual([
      {
        id: "call_1",
        name: "get_weather",
        arguments: '{"city":"Beijing"}',
      },
    ]);
  });

  it("should handle chat with mock fetch", async () => {
    const mockResponse = {
      id: "chat-789",
      model: "test-model",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: "Mocked response" },
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const adapter = createAdapter();
    const response = await adapter.chat({
      model: "test-model",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(response.message.content).toBe("Mocked response");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.test.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );

    globalThis.fetch = originalFetch;
  });

  it("should throw ProviderError on failed request", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          error: { message: "Invalid API key" },
        }),
    });

    const adapter = createAdapter();
    await expect(
      adapter.chat({
        model: "test-model",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).rejects.toThrow("Invalid API key");

    globalThis.fetch = originalFetch;
  });
});
