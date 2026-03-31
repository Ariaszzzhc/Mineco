import type { ChatRequest, ChatStreamChunk, Provider } from "@mineco/provider";

/**
 * Create a mock Provider whose chatStream yields the given chunk arrays
 * in sequence (one array per call).
 */
export function mockProvider(...stepChunks: ChatStreamChunk[][]): Provider {
  let callCount = 0;
  return {
    id: "test",
    name: "test",
    chatStream: async function* (_req: ChatRequest) {
      const chunks = stepChunks[callCount++];
      if (chunks) yield* chunks;
    },
    chat: () => {
      throw new Error("not implemented");
    },
    listModels: () => [],
  };
}

/** Helper to build a text-delta chunk */
export function textChunk(content: string): ChatStreamChunk {
  return {
    delta: { content },
    finishReason: null,
  };
}

/** Helper to build a thinking-delta chunk */
export function thinkingChunk(thinking: string): ChatStreamChunk {
  return {
    delta: { thinking },
    finishReason: null,
  };
}

/** Helper to build a tool-call delta chunk */
export function toolCallDelta(
  index: number,
  partial: { id?: string; name?: string; arguments?: string },
): ChatStreamChunk {
  return {
    delta: { toolCalls: [{ index, ...partial }] },
    finishReason: null,
  };
}

/** Helper to build a finish chunk */
export function finishChunk(
  reason: ChatStreamChunk["finishReason"],
  usage?: ChatStreamChunk["usage"],
): ChatStreamChunk {
  return usage
    ? { delta: {}, usage, finishReason: reason }
    : { delta: {}, finishReason: reason };
}
