import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../../src/lib/types";

const mockStreamChat = vi.hoisted(() => vi.fn());
const mockConfigStore = vi.hoisted(() => ({
  activeProviderId: vi.fn<() => string | null>(() => "zhipu"),
  activeModel: vi.fn<() => string | null>(() => "glm-4"),
}));
const mockSessionStore = vi.hoisted(() => ({
  refreshCurrentSession: vi.fn(async () => {}),
}));

vi.mock("../../src/lib/sse-client", () => ({
  streamChat: mockStreamChat,
}));
vi.mock("../../src/stores/config", () => ({
  configStore: mockConfigStore,
}));
vi.mock("../../src/stores/session", () => ({
  sessionStore: mockSessionStore,
}));

import { chatStore } from "../../src/stores/chat";

describe("chatStore", () => {
  let capturedOnEvent: (event: AgentEvent) => void;
  let mockAbort: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnEvent = () => {};
    mockAbort = vi.fn();

    mockStreamChat.mockImplementation(
      (
        _sid: string,
        _msg: string,
        _pid: string,
        _model: string,
        onEvent: (e: AgentEvent) => void,
      ) => {
        capturedOnEvent = onEvent;
        return {
          promise: new Promise<void>((resolve) => resolve()),
          abort: mockAbort,
        };
      },
    );

    mockConfigStore.activeProviderId.mockReturnValue("zhipu");
    mockConfigStore.activeModel.mockReturnValue("glm-4");
    mockSessionStore.refreshCurrentSession.mockResolvedValue(undefined);
  });

  it("should have correct initial state", () => {
    expect(chatStore.isStreaming()).toBe(false);
    expect(chatStore.streamingText()).toBe("");
    expect(chatStore.streamingThinking()).toBe("");
    expect(chatStore.streamingToolCalls()).toEqual([]);
    expect(chatStore.streamingToolResults()).toEqual([]);
    expect(chatStore.error()).toBeNull();
    expect(chatStore.sessionUsage()).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  describe("startStream", () => {
    it("should return early when stream already in progress", async () => {
      // Set up a stream that never resolves
      let resolveStream: () => void = () => {};
      mockStreamChat.mockImplementation((_s, _m, _p, _mo, onEvent) => {
        capturedOnEvent = onEvent;
        return {
          promise: new Promise<void>((r) => {
            resolveStream = r;
          }),
          abort: mockAbort,
        };
      });

      // Start first stream
      const p1 = chatStore.startStream("s1", "hello");
      expect(chatStore.isStreaming()).toBe(true);

      // Try to start second - should be no-op
      await chatStore.startStream("s1", "hello again");
      expect(mockStreamChat).toHaveBeenCalledOnce();

      // Clean up
      resolveStream?.();
      await p1;
    });

    it("should set error when no active provider", async () => {
      mockConfigStore.activeProviderId.mockReturnValue(null);
      await chatStore.startStream("s1", "hello");
      expect(chatStore.error()).toBe("No provider or model configured");
      expect(chatStore.isStreaming()).toBe(false);
    });

    it("should set error when no active model", async () => {
      mockConfigStore.activeModel.mockReturnValue(null);
      await chatStore.startStream("s1", "hello");
      expect(chatStore.error()).toBe("No provider or model configured");
    });

    it("should call streamChat with correct arguments", async () => {
      await chatStore.startStream("s1", "hello");
      expect(mockStreamChat).toHaveBeenCalledWith(
        "s1",
        "hello",
        "zhipu",
        "glm-4",
        expect.any(Function),
      );
    });

    it("should accumulate text deltas", async () => {
      let resolveStream: () => void = () => {};
      mockStreamChat.mockImplementation((_s, _m, _p, _mo, onEvent) => {
        capturedOnEvent = onEvent;
        return {
          promise: new Promise<void>((r) => {
            resolveStream = r;
          }),
          abort: mockAbort,
        };
      });

      const p = chatStore.startStream("s1", "hello");
      capturedOnEvent({ type: "text-delta", delta: "Hello" });
      capturedOnEvent({ type: "text-delta", delta: " world" });
      expect(chatStore.streamingText()).toBe("Hello world");

      resolveStream?.();
      await p;
    });

    it("should accumulate thinking deltas", async () => {
      let resolveStream: () => void = () => {};
      mockStreamChat.mockImplementation((_s, _m, _p, _mo, onEvent) => {
        capturedOnEvent = onEvent;
        return {
          promise: new Promise<void>((r) => {
            resolveStream = r;
          }),
          abort: mockAbort,
        };
      });

      const p = chatStore.startStream("s1", "hello");
      capturedOnEvent({ type: "thinking-delta", delta: "Let me" });
      capturedOnEvent({ type: "thinking-delta", delta: " think" });
      expect(chatStore.streamingThinking()).toBe("Let me think");

      resolveStream?.();
      await p;
    });

    it("should accumulate tool-call events", async () => {
      let resolveStream: () => void = () => {};
      mockStreamChat.mockImplementation((_s, _m, _p, _mo, onEvent) => {
        capturedOnEvent = onEvent;
        return {
          promise: new Promise<void>((r) => {
            resolveStream = r;
          }),
          abort: mockAbort,
        };
      });

      const p = chatStore.startStream("s1", "hello");
      const tc = {
        type: "tool-call" as const,
        toolCallId: "tc1",
        toolName: "read",
        args: {},
      };
      capturedOnEvent(tc);
      expect(chatStore.streamingToolCalls()).toHaveLength(1);
      expect(chatStore.streamingToolCalls()[0]).toEqual(tc);

      resolveStream?.();
      await p;
    });

    it("should accumulate tool-result events", async () => {
      let resolveStream: () => void = () => {};
      mockStreamChat.mockImplementation((_s, _m, _p, _mo, onEvent) => {
        capturedOnEvent = onEvent;
        return {
          promise: new Promise<void>((r) => {
            resolveStream = r;
          }),
          abort: mockAbort,
        };
      });

      const p = chatStore.startStream("s1", "hello");
      const tr = {
        type: "tool-result" as const,
        toolCallId: "tc1",
        toolName: "read",
        result: "ok",
        isError: false,
      };
      capturedOnEvent(tr);
      expect(chatStore.streamingToolResults()).toHaveLength(1);

      resolveStream?.();
      await p;
    });

    it("should set error on error event", async () => {
      let resolveStream: () => void = () => {};
      mockStreamChat.mockImplementation((_s, _m, _p, _mo, onEvent) => {
        capturedOnEvent = onEvent;
        return {
          promise: new Promise<void>((r) => {
            resolveStream = r;
          }),
          abort: mockAbort,
        };
      });

      const p = chatStore.startStream("s1", "hello");
      capturedOnEvent({ type: "error", error: "boom" });
      expect(chatStore.error()).toBe("boom");

      resolveStream?.();
      await p;
    });

    it("should clear streaming state in finally", async () => {
      await chatStore.startStream("s1", "hello");
      expect(chatStore.isStreaming()).toBe(false);
      expect(chatStore.streamingText()).toBe("");
      expect(chatStore.streamingThinking()).toBe("");
      expect(chatStore.streamingToolCalls()).toEqual([]);
      expect(chatStore.streamingToolResults()).toEqual([]);
    });

    it("should call refreshCurrentSession in finally", async () => {
      await chatStore.startStream("s1", "hello");
      expect(mockSessionStore.refreshCurrentSession).toHaveBeenCalled();
    });

    it("should handle AbortError silently", async () => {
      mockStreamChat.mockImplementation(() => ({
        promise: Promise.reject(new DOMException("Aborted", "AbortError")),
        abort: mockAbort,
      }));
      await chatStore.startStream("s1", "hello");
      expect(chatStore.error()).toBeNull();
      expect(chatStore.isStreaming()).toBe(false);
    });

    it("should set error on non-AbortError exceptions", async () => {
      mockStreamChat.mockImplementation(() => ({
        promise: Promise.reject(new Error("Network error")),
        abort: mockAbort,
      }));
      await chatStore.startStream("s1", "hello");
      expect(chatStore.error()).toBe("Network error");
    });

    it("should reset currentAbort in finally allowing next stream", async () => {
      await chatStore.startStream("s1", "hello");
      expect(chatStore.isStreaming()).toBe(false);
      // Should be able to start another stream
      await chatStore.startStream("s1", "hello again");
      expect(mockStreamChat).toHaveBeenCalledTimes(2);
    });

    it("should accumulate usage events", async () => {
      let resolveStream: () => void = () => {};
      mockStreamChat.mockImplementation((_s, _m, _p, _mo, onEvent) => {
        capturedOnEvent = onEvent;
        return {
          promise: new Promise<void>((r) => {
            resolveStream = r;
          }),
          abort: mockAbort,
        };
      });

      const p = chatStore.startStream("s1", "hello");
      capturedOnEvent({
        type: "usage",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      expect(chatStore.sessionUsage()).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });

      capturedOnEvent({
        type: "usage",
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      });
      expect(chatStore.sessionUsage()).toEqual({
        promptTokens: 300,
        completionTokens: 150,
        totalTokens: 450,
      });

      resolveStream?.();
      await p;
    });

    it("should reset sessionUsage on new stream", async () => {
      // First stream with usage
      let resolveStream1: () => void = () => {};
      mockStreamChat.mockImplementation((_s, _m, _p, _mo, onEvent) => {
        capturedOnEvent = onEvent;
        return {
          promise: new Promise<void>((r) => {
            resolveStream1 = r;
          }),
          abort: mockAbort,
        };
      });

      const p1 = chatStore.startStream("s1", "hello");
      capturedOnEvent({
        type: "usage",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      expect(chatStore.sessionUsage().totalTokens).toBe(150);

      resolveStream1?.();
      await p1;

      // Second stream should reset usage
      let resolveStream2: () => void = () => {};
      mockStreamChat.mockImplementation((_s, _m, _p, _mo, onEvent) => {
        capturedOnEvent = onEvent;
        return {
          promise: new Promise<void>((r) => {
            resolveStream2 = r;
          }),
          abort: mockAbort,
        };
      });

      const p2 = chatStore.startStream("s1", "new message");
      expect(chatStore.sessionUsage()).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });

      resolveStream2?.();
      await p2;
    });
  });

  describe("stopStream", () => {
    it("should call abort function", async () => {
      let resolveStream: () => void = () => {};
      mockStreamChat.mockImplementation((_s, _m, _p, _mo, onEvent) => {
        capturedOnEvent = onEvent;
        return {
          promise: new Promise<void>((r) => {
            resolveStream = r;
          }),
          abort: mockAbort,
        };
      });

      const p = chatStore.startStream("s1", "hello");
      chatStore.stopStream();
      expect(mockAbort).toHaveBeenCalled();

      resolveStream?.();
      await p;
    });

    it("should be no-op when no stream is active", () => {
      chatStore.stopStream(); // should not throw
      expect(mockAbort).not.toHaveBeenCalled();
    });
  });
});
