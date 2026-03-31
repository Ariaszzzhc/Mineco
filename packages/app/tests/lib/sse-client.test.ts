import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamChat } from "../../src/lib/sse-client";
import type { AgentEvent } from "../../src/lib/types";

function createSSEResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]!));
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("streamChat", () => {
  const mockFetch =
    vi.fn<(input: RequestInfo, init?: RequestInit) => Promise<Response>>();
  let _capturedOnEvent: (event: AgentEvent) => void;

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    _capturedOnEvent = () => {};
  });

  function _mockStreamWith(chunks: string[]) {
    mockFetch.mockImplementation((_input, _init) => {
      // Capture onEvent from the call context
      return Promise.resolve(createSSEResponse(chunks));
    });
  }

  it("should POST to correct endpoint with body", async () => {
    mockFetch.mockResolvedValue(createSSEResponse([]));
    const { promise } = streamChat("s1", "hello", "zhipu", "glm-4", () => {});
    await promise;
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/sessions/s1/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const call = mockFetch.mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body).toEqual({
      message: "hello",
      providerId: "zhipu",
      model: "glm-4",
    });
  });

  it("should throw with body error on non-ok response", async () => {
    mockFetch.mockResolvedValue(createSSEResponse([], 500));
    const res = new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
    });
    mockFetch.mockResolvedValue(res);
    const { promise } = streamChat("s1", "hi", "zhipu", "glm-4", () => {});
    await expect(promise).rejects.toThrow("Server error");
  });

  it("should throw HTTP status fallback when error body is malformed", async () => {
    const res = new Response("not json", {
      status: 502,
      statusText: "Bad Gateway",
    });
    mockFetch.mockResolvedValue(res);
    const { promise } = streamChat("s1", "hi", "zhipu", "glm-4", () => {});
    await expect(promise).rejects.toThrow("HTTP 502");
  });

  it("should throw when response body is null", async () => {
    const res = new Response(null, { status: 200 });
    mockFetch.mockResolvedValue(res);
    const { promise } = streamChat("s1", "hi", "zhipu", "glm-4", () => {});
    await expect(promise).rejects.toThrow("No response body");
  });

  it("should parse single SSE event", async () => {
    const events: AgentEvent[] = [];
    const chunk =
      'event: text-delta\ndata: {"type":"text-delta","delta":"hello"}\n\n';
    mockFetch.mockResolvedValue(createSSEResponse([chunk]));
    const { promise } = streamChat("s1", "hi", "zhipu", "glm-4", (e) =>
      events.push(e),
    );
    await promise;
    expect(events).toEqual([{ type: "text-delta", delta: "hello" }]);
  });

  it("should parse multiple events from single chunk", async () => {
    const events: AgentEvent[] = [];
    const chunk =
      'event: text-delta\ndata: {"type":"text-delta","delta":"hi"}\n\n' +
      'event: text-delta\ndata: {"type":"text-delta","delta":" there"}\n\n';
    mockFetch.mockResolvedValue(createSSEResponse([chunk]));
    const { promise } = streamChat("s1", "hi", "zhipu", "glm-4", (e) =>
      events.push(e),
    );
    await promise;
    expect(events).toEqual([
      { type: "text-delta", delta: "hi" },
      { type: "text-delta", delta: " there" },
    ]);
  });

  it("should buffer partial events across chunks", async () => {
    const events: AgentEvent[] = [];
    const chunk1 = 'event: text-delta\ndata: {"type":"text-delta","delta":"hel';
    const chunk2 = 'lo"}\n\n';
    mockFetch.mockResolvedValue(createSSEResponse([chunk1, chunk2]));
    const { promise } = streamChat("s1", "hi", "zhipu", "glm-4", (e) =>
      events.push(e),
    );
    await promise;
    expect(events).toEqual([{ type: "text-delta", delta: "hello" }]);
  });

  it("should skip empty parts", async () => {
    const events: AgentEvent[] = [];
    const chunk =
      '\n\nevent: text-delta\ndata: {"type":"text-delta","delta":"hi"}\n\n\n\n';
    mockFetch.mockResolvedValue(createSSEResponse([chunk]));
    const { promise } = streamChat("s1", "hi", "zhipu", "glm-4", (e) =>
      events.push(e),
    );
    await promise;
    expect(events).toHaveLength(1);
  });

  it("should skip events with no data line", async () => {
    const events: AgentEvent[] = [];
    const chunk = "event: text-delta\n\n";
    mockFetch.mockResolvedValue(createSSEResponse([chunk]));
    const { promise } = streamChat("s1", "hi", "zhipu", "glm-4", (e) =>
      events.push(e),
    );
    await promise;
    expect(events).toHaveLength(0);
  });

  it("should warn and skip malformed JSON", async () => {
    const events: AgentEvent[] = [];
    const chunk = "data: not-json\n\n";
    mockFetch.mockResolvedValue(createSSEResponse([chunk]));
    const { promise } = streamChat("s1", "hi", "zhipu", "glm-4", (e) =>
      events.push(e),
    );
    await promise;
    expect(events).toHaveLength(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it("should fire onEvent for all event types", async () => {
    const events: AgentEvent[] = [];
    const chunk = `${[
      'event: text-delta\ndata: {"type":"text-delta","delta":"hi"}',
      'event: tool-call\ndata: {"type":"tool-call","toolCallId":"tc1","toolName":"read","args":{}}',
      'event: tool-result\ndata: {"type":"tool-result","toolCallId":"tc1","toolName":"read","result":"ok","isError":false}',
      'event: usage\ndata: {"type":"usage","usage":{"promptTokens":10,"completionTokens":5,"totalTokens":15}}',
      'event: step\ndata: {"type":"step","step":1,"maxSteps":10}',
      'event: complete\ndata: {"type":"complete","reason":"stop"}',
      'event: error\ndata: {"type":"error","error":"boom"}',
    ].join("\n\n")}\n\n`;
    mockFetch.mockResolvedValue(createSSEResponse([chunk]));
    const { promise } = streamChat("s1", "hi", "zhipu", "glm-4", (e) =>
      events.push(e),
    );
    await promise;
    expect(events).toHaveLength(7);
    expect(events[0]).toEqual({ type: "text-delta", delta: "hi" });
    expect(events[1]).toEqual({
      type: "tool-call",
      toolCallId: "tc1",
      toolName: "read",
      args: {},
    });
    expect(events[2]).toEqual({
      type: "tool-result",
      toolCallId: "tc1",
      toolName: "read",
      result: "ok",
      isError: false,
    });
    expect(events[3]).toEqual({
      type: "usage",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
    expect(events[4]).toEqual({ type: "step", step: 1, maxSteps: 10 });
    expect(events[5]).toEqual({ type: "complete", reason: "stop" });
    expect(events[6]).toEqual({ type: "error", error: "boom" });
  });

  it("should return object with promise and abort", () => {
    mockFetch.mockResolvedValue(createSSEResponse([]));
    const handle = streamChat("s1", "hi", "zhipu", "glm-4", () => {});
    expect(handle).toHaveProperty("promise");
    expect(handle).toHaveProperty("abort");
    expect(typeof handle.abort).toBe("function");
    return handle.promise; // drain
  });

  it("should pass AbortController signal to fetch", async () => {
    mockFetch.mockResolvedValue(createSSEResponse([]));
    const { promise } = streamChat("s1", "hi", "zhipu", "glm-4", () => {});
    await promise;
    const call = mockFetch.mock.calls[0]!;
    const init = call[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
