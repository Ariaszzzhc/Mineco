import type { Session, SessionMessage } from "@mineco/agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SqliteWorkspaceStore } from "../../src/storage/workspace-store.js";
import { createMockProviderRegistry } from "../helper/mock-provider-registry.js";
import { createMockSessionStore } from "../helper/mock-session-store.js";
import { collectSSEEvents } from "../helper/sse-helpers.js";

// vi.hoisted runs before vi.mock factory but after module hoisting
const { mockRun } = vi.hoisted(() => ({
  mockRun: vi.fn(),
}));

vi.mock("@mineco/agent", () => ({
  AgentLoop: class {
    run = mockRun;
  },
  ContextManager: class {
    prepareContext = vi.fn(async (messages: unknown, systemPrompt: string) => ({
      messages: [],
      systemPrompt,
      stats: { microCompacted: false, memoryExtracted: false },
    }));
  },
  buildSystemPrompt: vi.fn(() => "system prompt"),
  createDefaultToolRegistry: vi.fn(() => ({
    register: vi.fn(),
    getAll: vi.fn(() => []),
    toApiTools: vi.fn(() => []),
    execute: vi.fn(),
    get: vi.fn(),
  })),
  createAgentTool: vi.fn(() => ({
    name: "agent",
    description: "mock agent tool",
    parameters: {},
    execute: vi.fn(),
  })),
  agentDefinitions: new Map(),
}));

// Mock node:crypto for deterministic UUIDs
vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "mock-uuid-1"),
}));

import { createChatRoutes } from "../../src/routes/chat.js";

function createMockWorkspaceStore() {
  return {
    get: vi.fn(async () => ({
      id: "ws-1",
      path: "/test/workspace",
      name: "workspace",
      lastOpenedAt: Date.now(),
      createdAt: Date.now(),
    })),
    findByPath: vi.fn(async () => undefined),
    list: vi.fn(async () => []),
    create: vi.fn(async (path: string) => ({
      id: "ws-1",
      path,
      name: path.split("/").pop() ?? path,
      lastOpenedAt: Date.now(),
      createdAt: Date.now(),
    })),
    updateLastOpened: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  };
}

function jsonHeaders(): Headers {
  return new Headers({ "Content-Type": "application/json" });
}

function createTestSession(messages: SessionMessage[] = []): Session {
  return {
    id: "test-session-id",
    title: "Test Session",
    workspaceId: "ws-1",
    messages,
    createdAt: 1000,
    updatedAt: 2000,
  };
}

describe("Chat Routes", () => {
  let store: ReturnType<typeof createMockSessionStore>;
  let registry: ReturnType<typeof createMockProviderRegistry>;
  let workspaceStore: ReturnType<typeof createMockWorkspaceStore>;
  let app: ReturnType<typeof createChatRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createMockSessionStore();
    registry = createMockProviderRegistry();
    workspaceStore = createMockWorkspaceStore();
    app = createChatRoutes(
      registry,
      store,
      workspaceStore as unknown as SqliteWorkspaceStore,
    );
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
        body: JSON.stringify({
          message: "hello",
          providerId: "zhipu",
          model: "glm-4",
        }),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Session not found");
    });
  });

  describe("SSE streaming", () => {
    async function* mockStream(
      events: Array<{ type: string; [key: string]: unknown }>,
    ) {
      for (const event of events) {
        yield event;
      }
    }

    it("should return 200 with text/event-stream content type", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(
        mockStream([{ type: "complete", reason: "stop" }]),
      );

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "hello",
          providerId: "zhipu",
          model: "glm-4",
        }),
        headers: jsonHeaders(),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    });

    it("should save user message before streaming", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(
        mockStream([{ type: "complete", reason: "stop" }]),
      );

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "hello",
          providerId: "zhipu",
          model: "glm-4",
        }),
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
      mockRun.mockReturnValue(
        mockStream([
          { type: "text-delta", delta: "Hello" },
          { type: "text-delta", delta: " world" },
          { type: "complete", reason: "stop" },
        ]),
      );

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "hi",
          providerId: "zhipu",
          model: "glm-4",
        }),
        headers: jsonHeaders(),
      });

      const events = await collectSSEEvents(res);
      const textDeltas = events.filter((e) => e.event === "text-delta");
      expect(textDeltas).toHaveLength(2);
      expect(textDeltas[0]?.data).toEqual({
        type: "text-delta",
        delta: "Hello",
      });
      expect(textDeltas[1]?.data).toEqual({
        type: "text-delta",
        delta: " world",
      });
    });

    it("should save assistant message on complete", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(
        mockStream([
          { type: "text-delta", delta: "Hello world" },
          { type: "complete", reason: "stop" },
        ]),
      );

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "hi",
          providerId: "zhipu",
          model: "glm-4",
        }),
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
      expect((assistantCall?.[1] as SessionMessage).content).toBe(
        "Hello world",
      );
    });

    it("should save tool messages on complete", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(
        mockStream([
          { type: "text-delta", delta: "" },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "readFile",
            args: { file_path: "/tmp/test" },
          },
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "readFile",
            result: "file content",
            isError: false,
          },
          { type: "complete", reason: "stop" },
        ]),
      );

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "read a file",
          providerId: "zhipu",
          model: "glm-4",
        }),
        headers: jsonHeaders(),
      });
      // Must consume the streaming body
      await res.text();

      // user message + assistant text (empty, but text-delta was emitted before tool-call)
      // currentText is "" when tool-call arrives, so no assistant message for empty text
      // tool messages are saved on complete
      const toolMsgs = (
        store.addMessage as ReturnType<typeof vi.fn>
      ).mock.calls.filter(
        (call: unknown[]) => (call[1] as SessionMessage).role === "tool",
      );
      expect(toolMsgs.length).toBe(1);
      expect((toolMsgs[0]?.[1] as SessionMessage).toolName).toBe("readFile");
    });

    it("should save assistant text before tool-call event", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(
        mockStream([
          { type: "text-delta", delta: "Let me" },
          { type: "text-delta", delta: " read that file" },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "readFile",
            args: { file_path: "/tmp/test" },
          },
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "readFile",
            result: "file content",
            isError: false,
          },
          { type: "complete", reason: "stop" },
        ]),
      );

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "hi",
          providerId: "zhipu",
          model: "glm-4",
        }),
        headers: jsonHeaders(),
      });
      await res.text();

      const addMessageMock = store.addMessage as ReturnType<typeof vi.fn>;
      const assistantMsgs = addMessageMock.mock.calls.filter(
        (call: unknown[]) => (call[1] as SessionMessage).role === "assistant",
      );
      expect(assistantMsgs.length).toBe(1);
      expect((assistantMsgs[0]?.[1] as SessionMessage).content).toBe(
        "Let me read that file",
      );
    });

    it("should stream thinking-delta events", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(
        mockStream([
          { type: "thinking-delta", delta: "Let me reason" },
          { type: "thinking-delta", delta: " about this" },
          { type: "text-delta", delta: "Answer" },
          { type: "complete", reason: "stop" },
        ]),
      );

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "hi",
          providerId: "zhipu",
          model: "glm-4",
        }),
        headers: jsonHeaders(),
      });

      const events = await collectSSEEvents(res);
      const thinkingDeltas = events.filter((e) => e.event === "thinking-delta");
      expect(thinkingDeltas).toHaveLength(2);
      expect(thinkingDeltas[0]?.data).toEqual({
        type: "thinking-delta",
        delta: "Let me reason",
      });
    });

    it("should save thinking with assistant message on complete", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(
        mockStream([
          { type: "thinking-delta", delta: "reasoning..." },
          { type: "text-delta", delta: "Answer" },
          { type: "complete", reason: "stop" },
        ]),
      );

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "hi",
          providerId: "zhipu",
          model: "glm-4",
        }),
        headers: jsonHeaders(),
      });
      await res.text();

      const addMessageMock = store.addMessage as ReturnType<typeof vi.fn>;
      const assistantMsgs = addMessageMock.mock.calls.filter(
        (call: unknown[]) => (call[1] as SessionMessage).role === "assistant",
      );
      expect(assistantMsgs.length).toBe(1);
      expect((assistantMsgs[0]?.[1] as SessionMessage).content).toBe("Answer");
      expect((assistantMsgs[0]?.[1] as SessionMessage).thinking).toBe(
        "reasoning...",
      );
    });

    it("should save thinking with assistant text before tool-call", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(
        mockStream([
          { type: "thinking-delta", delta: "thinking first" },
          { type: "text-delta", delta: "I will read" },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "readFile",
            args: { file_path: "/tmp/test" },
          },
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "readFile",
            result: "content",
            isError: false,
          },
          { type: "complete", reason: "stop" },
        ]),
      );

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "hi",
          providerId: "zhipu",
          model: "glm-4",
        }),
        headers: jsonHeaders(),
      });
      await res.text();

      const addMessageMock = store.addMessage as ReturnType<typeof vi.fn>;
      const assistantMsgs = addMessageMock.mock.calls.filter(
        (call: unknown[]) => (call[1] as SessionMessage).role === "assistant",
      );
      expect(assistantMsgs.length).toBe(1);
      expect((assistantMsgs[0]?.[1] as SessionMessage).thinking).toBe(
        "thinking first",
      );
    });

    it("should not set thinking when no thinking-delta events", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockReturnValue(
        mockStream([
          { type: "text-delta", delta: "Hello" },
          { type: "complete", reason: "stop" },
        ]),
      );

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "hi",
          providerId: "zhipu",
          model: "glm-4",
        }),
        headers: jsonHeaders(),
      });
      await res.text();

      const addMessageMock = store.addMessage as ReturnType<typeof vi.fn>;
      const assistantMsgs = addMessageMock.mock.calls.filter(
        (call: unknown[]) => (call[1] as SessionMessage).role === "assistant",
      );
      expect(assistantMsgs.length).toBe(1);
      expect(
        (assistantMsgs[0]?.[1] as SessionMessage).thinking,
      ).toBeUndefined();
    });

    it("should send error event when agent loop throws", async () => {
      store.get = vi.fn(async () => createTestSession());
      mockRun.mockImplementation(() => {
        throw new Error("Provider error");
      });

      const res = await app.request("/test-session-id/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "hi",
          providerId: "zhipu",
          model: "glm-4",
        }),
        headers: jsonHeaders(),
      });

      expect(res.status).toBe(200);
      const events = await collectSSEEvents(res);
      const errorEvent = events.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      const data = errorEvent?.data as { type: string; error: string };
      expect(data.type).toBe("error");
      expect(data.error).toContain("Provider error");
    });
  });
});
