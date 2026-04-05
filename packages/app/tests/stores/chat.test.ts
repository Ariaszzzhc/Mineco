import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent } from "../../src/lib/types";

const mockStreamChat = vi.hoisted(() => vi.fn());
const mockConfigStore = vi.hoisted(() => ({
  activeProviderId: vi.fn<() => string | null>(() => "zhipu"),
  activeModel: vi.fn<() => string | null>(() => "glm-4"),
}));
const mockSessionStore = vi.hoisted(() => ({
  refreshCurrentSession: vi.fn(async () => {}),
  refreshSession: vi.fn(async () => {}),
  addMessageToSession: vi.fn(),
  updateTitle: vi.fn(),
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

const SID = "s1";

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
        _baseUrlOverride?: string,
        _onConnected?: () => void,
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
    expect(chatStore.isStreaming(SID)).toBe(false);
    expect(chatStore.streamingText(SID)).toBe("");
    expect(chatStore.streamingThinking(SID)).toBe("");
    expect(chatStore.streamingToolCalls(SID)).toEqual([]);
    expect(chatStore.streamingToolResults(SID)).toEqual([]);
    expect(chatStore.error(SID)).toBeNull();
    expect(chatStore.sessionUsage(SID)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  describe("startStream", () => {
    it("should return early when stream already in progress for same session", async () => {
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
      const p1 = chatStore.startStream(SID, "hello");
      expect(chatStore.isStreaming(SID)).toBe(true);

      // Try to start second on same session - should be no-op
      await chatStore.startStream(SID, "hello again");
      expect(mockStreamChat).toHaveBeenCalledOnce();

      // Clean up
      resolveStream?.();
      await p1;
    });

    it("should allow concurrent streams for different sessions", async () => {
      let resolveStream1: () => void = () => {};
      let resolveStream2: () => void = () => {};
      let callCount = 0;
      mockStreamChat.mockImplementation((_s, _m, _p, _mo, onEvent) => {
        callCount++;
        if (callCount === 1) {
          capturedOnEvent = onEvent;
          return {
            promise: new Promise<void>((r) => {
              resolveStream1 = r;
            }),
            abort: mockAbort,
          };
        }
        return {
          promise: new Promise<void>((r) => {
            resolveStream2 = r;
          }),
          abort: mockAbort,
        };
      });

      const p1 = chatStore.startStream("s1", "hello");
      const p2 = chatStore.startStream("s2", "hello from s2");

      expect(chatStore.isStreaming("s1")).toBe(true);
      expect(chatStore.isStreaming("s2")).toBe(true);

      resolveStream1?.();
      resolveStream2?.();
      await Promise.all([p1, p2]);
    });

    it("should set error when no active provider", async () => {
      mockConfigStore.activeProviderId.mockReturnValue(null);
      await chatStore.startStream(SID, "hello");
      expect(chatStore.error(SID)).toBe("No provider or model configured");
      expect(chatStore.isStreaming(SID)).toBe(false);
    });

    it("should set error when no active model", async () => {
      mockConfigStore.activeModel.mockReturnValue(null);
      await chatStore.startStream(SID, "hello");
      expect(chatStore.error(SID)).toBe("No provider or model configured");
    });

    it("should call streamChat with correct arguments", async () => {
      await chatStore.startStream(SID, "hello");
      expect(mockStreamChat).toHaveBeenCalledWith(
        SID,
        "hello",
        "zhipu",
        "glm-4",
        expect.any(Function),
        undefined,
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

      const p = chatStore.startStream(SID, "hello");
      capturedOnEvent({ type: "text-delta", delta: "Hello" });
      capturedOnEvent({ type: "text-delta", delta: " world" });
      expect(chatStore.streamingText(SID)).toBe("Hello world");

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

      const p = chatStore.startStream(SID, "hello");
      capturedOnEvent({ type: "thinking-delta", delta: "Let me" });
      capturedOnEvent({ type: "thinking-delta", delta: " think" });
      expect(chatStore.streamingThinking(SID)).toBe("Let me think");

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

      const p = chatStore.startStream(SID, "hello");
      const tc = {
        type: "tool-call" as const,
        toolCallId: "tc1",
        toolName: "read",
        args: {},
      };
      capturedOnEvent(tc);
      expect(chatStore.streamingToolCalls(SID)).toHaveLength(1);
      expect(chatStore.streamingToolCalls(SID)[0]).toEqual(tc);

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

      const p = chatStore.startStream(SID, "hello");
      const tr = {
        type: "tool-result" as const,
        toolCallId: "tc1",
        toolName: "read",
        result: "ok",
        isError: false,
      };
      capturedOnEvent(tr);
      expect(chatStore.streamingToolResults(SID)).toHaveLength(1);

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

      const p = chatStore.startStream(SID, "hello");
      capturedOnEvent({ type: "error", error: "boom" });
      expect(chatStore.error(SID)).toBe("boom");

      resolveStream?.();
      await p;
    });

    it("should clear isStreaming in finally", async () => {
      await chatStore.startStream(SID, "hello");
      expect(chatStore.isStreaming(SID)).toBe(false);
    });

    it("should call refreshSession in finally", async () => {
      await chatStore.startStream(SID, "hello");
      expect(mockSessionStore.refreshSession).toHaveBeenCalledWith(SID);
    });

    it("should handle AbortError silently", async () => {
      mockStreamChat.mockImplementation(() => ({
        promise: Promise.reject(new DOMException("Aborted", "AbortError")),
        abort: mockAbort,
      }));
      await chatStore.startStream(SID, "hello");
      expect(chatStore.error(SID)).toBeNull();
      expect(chatStore.isStreaming(SID)).toBe(false);
    });

    it("should set error on non-AbortError exceptions", async () => {
      mockStreamChat.mockImplementation(() => ({
        promise: Promise.reject(new Error("Network error")),
        abort: mockAbort,
      }));
      await chatStore.startStream(SID, "hello");
      expect(chatStore.error(SID)).toBe("Network error");
    });

    it("should allow next stream after completion", async () => {
      await chatStore.startStream(SID, "hello");
      expect(chatStore.isStreaming(SID)).toBe(false);
      // Should be able to start another stream for the same session
      await chatStore.startStream(SID, "hello again");
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

      const p = chatStore.startStream(SID, "hello");
      capturedOnEvent({
        type: "usage",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      expect(chatStore.sessionUsage(SID)).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });

      capturedOnEvent({
        type: "usage",
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      });
      expect(chatStore.sessionUsage(SID)).toEqual({
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

      const p1 = chatStore.startStream(SID, "hello");
      capturedOnEvent({
        type: "usage",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      expect(chatStore.sessionUsage(SID).totalTokens).toBe(150);

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

      const p2 = chatStore.startStream(SID, "new message");
      expect(chatStore.sessionUsage(SID)).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });

      resolveStream2?.();
      await p2;
    });

    it("should handle message-persisted event by clearing streaming text and thinking", async () => {
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

      const p = chatStore.startStream(SID, "hello");
      capturedOnEvent({ type: "text-delta", delta: "Hello" });
      capturedOnEvent({ type: "thinking-delta", delta: "Thinking..." });
      expect(chatStore.streamingText(SID)).toBe("Hello");
      expect(chatStore.streamingThinking(SID)).toBe("Thinking...");

      const persistedMsg = {
        id: "msg-1",
        role: "assistant" as const,
        content: "Hello",
        thinking: "Thinking...",
        createdAt: Date.now(),
      };
      capturedOnEvent({ type: "message-persisted", message: persistedMsg });
      expect(mockSessionStore.addMessageToSession).toHaveBeenCalledWith(
        SID,
        persistedMsg,
      );
      expect(chatStore.streamingText(SID)).toBe("");
      expect(chatStore.streamingThinking(SID)).toBe("");

      resolveStream?.();
      await p;
    });

    it("should keep tool calls in streaming state after message-persisted", async () => {
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

      const p = chatStore.startStream(SID, "hello");
      capturedOnEvent({ type: "text-delta", delta: "Hello" });
      const tc = {
        type: "tool-call" as const,
        toolCallId: "tc1",
        toolName: "read",
        args: {},
      };
      capturedOnEvent(tc);

      // Persist clears text but not tool calls
      capturedOnEvent({
        type: "message-persisted",
        message: {
          id: "msg-1",
          role: "assistant" as const,
          content: "Hello",
          createdAt: Date.now(),
        },
      });
      expect(chatStore.streamingText(SID)).toBe("");
      expect(chatStore.streamingToolCalls(SID)).toHaveLength(1);

      resolveStream?.();
      await p;
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

      const p = chatStore.startStream(SID, "hello");
      chatStore.stopStream(SID);
      expect(mockAbort).toHaveBeenCalled();

      resolveStream?.();
      await p;
    });

    it("should be no-op when no stream is active", () => {
      chatStore.stopStream(SID); // should not throw
      expect(mockAbort).not.toHaveBeenCalled();
    });
  });
});
