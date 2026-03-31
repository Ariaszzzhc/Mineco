import { describe, expect, it } from "vitest";
import { parseSSEStream } from "../src/sse.js";

function toStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("parseSSEStream", () => {
  it("should parse single data event", async () => {
    const stream = toStream(['data: {"content":"hello"}\n\n']);
    const results: string[] = [];
    for await (const chunk of parseSSEStream(stream)) {
      results.push(chunk);
    }
    expect(results).toEqual(['{"content":"hello"}']);
  });

  it("should parse multiple data events", async () => {
    const stream = toStream([
      'data: {"content":"hello"}\n\ndata: {"content":" world"}\n\n',
    ]);
    const results: string[] = [];
    for await (const chunk of parseSSEStream(stream)) {
      results.push(chunk);
    }
    expect(results).toEqual(['{"content":"hello"}', '{"content":" world"}']);
  });

  it("should stop at [DONE]", async () => {
    const stream = toStream(['data: {"content":"hi"}\n\ndata: [DONE]\n\n']);
    const results: string[] = [];
    for await (const chunk of parseSSEStream(stream)) {
      results.push(chunk);
    }
    expect(results).toEqual(['{"content":"hi"}']);
  });

  it("should skip empty lines and comments", async () => {
    const stream = toStream([': comment\n\ndata: {"ok":true}\n\n\n']);
    const results: string[] = [];
    for await (const chunk of parseSSEStream(stream)) {
      results.push(chunk);
    }
    expect(results).toEqual(['{"ok":true}']);
  });

  it("should handle split chunks", async () => {
    const stream = toStream(['data: {"con', 'tent":"split"}\n\n']);
    const results: string[] = [];
    for await (const chunk of parseSSEStream(stream)) {
      results.push(chunk);
    }
    expect(results).toEqual(['{"content":"split"}']);
  });
});
