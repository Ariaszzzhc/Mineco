import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Session, SessionMessage } from "@mineco/agent";
import { createMockSessionStore } from "../helper/mock-session-store.js";
import { createMockProviderRegistry } from "../helper/mock-provider-registry.js";
import { collectSSEEvents } from "../helper/sse-helpers.js";

// vi.hoisted runs before vi.mock factory but after module hoisting
const { mockRun } = vi.hoisted(() => ({
  mockRun: vi.fn(),
}));

vi.mock("@mineco/agent", () => ({
  AgentLoop: class {
    run = mockRun;
  },
  buildSystemPrompt: vi.fn(() => "system prompt"),
  createDefaultToolRegistry: vi.fn(() => ({})),
}));

// Mock node:crypto for deterministic UUIDs
vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "mock-uuid-1"),
}));

import { createChatRoutes } from "../../src/routes/chat.js";

function jsonHeaders(): Headers {
  return new Headers({ "Content-Type": "application/json" });
}

function createTestSession(messages: SessionMessage[] = []): Session {
  return {
    id: "test-session-id",
    title: "Test Session",
    messages,
    createdAt: 1000,
    updatedAt: 2000,
  };
}

describe("Chat Routes", () => {
  let store: ReturnType<typeof createMockSessionStore>;
  let registry: ReturnType<typeof createMockProviderRegistry>;
  let app: ReturnType<typeof createChatRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createMockSessionStore();
    registry = createMockProviderRegistry();
    app = createChatRoutes(registry, store);
  });

  describe("validation", () => {
    it("should return 400 when message is missing", async () => {
      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({}),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("message is required");
    });

    it("should return 400 when providerId is missing", async () => {
      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({ message: "hello", model: "gpt-4" }),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("providerId");
    });

    it("should return 400 when model is missing", async () => {
      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({ message: "hello", providerId: "zhipu" }),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("model");
    });

    it("should validate before checking session existence", async () => {
      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({}),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(400);
      expect(store.get).not.toHaveBeenCalled();
    });
  });

  describe("session lookup", () => {
    it("should return 404 when session does not exist", async () => {
      const res = await app.request("/non-existent/chat", {
        method: "POST",
        body: JSON.stringify({ message: "hello", providerId: "zhipu", model: "glm-4" }),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Session not found");
    });
  });

  describe("SSE streaming", () => {
    async function* mockStream(events: Array<{ type: string; [key: string]: unknown }>) {
      for (const event of events) {
        yield event;
      }
    }

    it("should return 200 with text/event-stream content type", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(mockStream([
        { type: "complete", reason: "stop" },
      ]));

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({ message: "hello", providerId: "zhipu", model: "glm-4" }),
        headers: jsonHeaders(),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    });

    it("should save user message before streaming", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(mockStream([
        { type: "complete", reason: "stop" },
      ]));

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({ message: "hello", providerId: "zhipu", model: "glm-4" }),
        headers: jsonHeaders(),
      });
      // Must consume the streaming body
      await res.text();

      expect(store.addMessage).toHaveBeenCalledWith(
        "test-session-id",
        expect.objectContaining({
          role: "user",
          content: "hello",
          id: "mock-uuid-1",
        }),
      );
    });

    it("should stream text-delta events correctly", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(mockStream([
        { type: "text-delta", delta: "Hello" },
        { type: "text-delta", delta: " world" },
        { type: "complete", reason: "stop" },
      ]));

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({ message: "hi", providerId: "zhipu", model: "glm-4" }),
        headers: jsonHeaders(),
      });

      const events = await collectSSEEvents(res);
      const textDeltas = events.filter((e) => e.event === "text-delta");
      expect(textDeltas).toHaveLength(2);
      expect(textDeltas[0]!.data).toEqual({ type: "text-delta", delta: "Hello" });
      expect(textDeltas[1]!.data).toEqual({ type: "text-delta", delta: " world" });
    });

    it("should save assistant message on complete", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(mockStream([
        { type: "text-delta", delta: "Hello world" },
        { type: "complete", reason: "stop" },
      ]));

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({ message: "hi", providerId: "zhipu", model: "glm-4" }),
        headers: jsonHeaders(),
      });
      // Must consume the streaming body to trigger the streamSSE callback
      await res.text();

      // Should have saved user message + assistant message
      expect(store.addMessage).toHaveBeenCalledTimes(2);
      const addMessageMock = store.addMessage as ReturnType<typeof vi.fn>;
      const assistantCall = addMessageMock.mock.calls.find(
        (call: unknown[]) => {
          const msg = call[1] as SessionMessage;
          return msg.role === "assistant";
        },
      );
      expect(assistantCall).toBeDefined();
      expect((assistantCall![1] as SessionMessage).content).toBe("Hello world");
    });

    it("should save tool messages on complete", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(mockStream([
        { type: "text-delta", delta: "" },
        { type: "tool-call", toolCallId: "call-1", toolName: "readFile", args: { file_path: "/tmp/test" } },
        { type: "tool-result", toolCallId: "call-1", toolName: "readFile", result: "file content", isError: false },
        { type: "complete", reason: "stop" },
      ]));

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({ message: "read a file", providerId: "zhipu", model: "glm-4" }),
        headers: jsonHeaders(),
      });
      // Must consume the streaming body
      await res.text();

      // user message + assistant text (empty, but text-delta was emitted before tool-call)
      // currentText is "" when tool-call arrives, so no assistant message for empty text
      // tool messages are saved on complete
      const toolMsgs = (store.addMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => (call[1] as SessionMessage).role === "tool",
      );
      expect(toolMsgs.length).toBe(1);
      expect((toolMsgs[0]![1] as SessionMessage).toolName).toBe("readFile");
    });

    it("should send error event when agent loop throws", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockImplementation(() => {
        throw new Error("Provider error");
      });

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({ message: "hi", providerId: "zhipu", model: "glm-4" }),
        headers: jsonHeaders(),
      });

      expect(res.status).toBe(200);
      const events = await collectSSEEvents(res);
      const errorEvent = events.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      const data = errorEvent!.data as { type: string; error: string };
      expect(data.type).toBe("error");
      expect(data.error).toContain("Provider error");
    });
  });
});
