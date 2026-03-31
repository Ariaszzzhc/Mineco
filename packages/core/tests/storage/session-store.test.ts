import type { SessionMessage } from "@mineco/agent";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/storage/schema.js";
import { SqliteSessionStore } from "../../src/storage/session-store.js";
import { createTestDb } from "../helper/test-db.js";

const TEST_WORKSPACE_ID = "test-workspace";

describe("SqliteSessionStore", () => {
  let db: Kysely<Database>;
  let store: SqliteSessionStore;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    cleanup = testDb.cleanup;
    store = new SqliteSessionStore(db);

    // Create a workspace for foreign key constraint
    await db
      .insertInto("workspaces")
      .values({
        id: TEST_WORKSPACE_ID,
        path: "/test/workspace",
        name: "test-workspace",
        last_opened_at: Date.now(),
        created_at: Date.now(),
      })
      .execute();
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("create()", () => {
    it("should create a session and return it", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      expect(session.id).toBeDefined();
      expect(session.title).toBe("New Session");
      expect(session.messages).toEqual([]);
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.updatedAt).toBeGreaterThan(0);
    });

    it("should persist session to database", async () => {
      const created = await store.create(TEST_WORKSPACE_ID);
      const fetched = await store.get(created.id);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
    });
  });

  describe("get()", () => {
    it("should return undefined for non-existent session", async () => {
      const result = await store.get("non-existent-id");
      expect(result).toBeUndefined();
    });

    it("should return session with messages ordered by created_at", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      const msg1: SessionMessage = {
        id: "msg-1",
        role: "user",
        content: "hello",
        createdAt: 1000,
      };
      const msg2: SessionMessage = {
        id: "msg-2",
        role: "assistant",
        content: "hi there",
        createdAt: 2000,
      };
      await store.addMessage(session.id, msg1);
      await store.addMessage(session.id, msg2);

      const result = await store.get(session.id);
      expect(result).toBeDefined();
      expect(result?.messages).toHaveLength(2);
      expect(result?.messages[0]?.id).toBe("msg-1");
      expect(result?.messages[1]?.id).toBe("msg-2");
    });

    it("should map tool_calls from JSON", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      const msg: SessionMessage = {
        id: "msg-tool",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-1",
            name: "readFile",
            arguments: JSON.stringify({ file_path: "/tmp/test.txt" }),
          },
        ],
        toolCallId: undefined as unknown as string,
        createdAt: 1000,
      };
      await store.addMessage(session.id, msg);

      const result = await store.get(session.id);
      expect(result?.messages[0]?.toolCalls).toEqual([
        {
          id: "call-1",
          name: "readFile",
          arguments: JSON.stringify({ file_path: "/tmp/test.txt" }),
        },
      ]);
    });

    it("should map is_error correctly", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      const errMsg: SessionMessage = {
        id: "msg-err",
        role: "tool",
        content: "file not found",
        isError: true,
        createdAt: 1000,
      };
      await store.addMessage(session.id, errMsg);

      const result = await store.get(session.id);
      expect(result?.messages[0]?.isError).toBe(true);
    });

    it("should not set isError when is_error is 0", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      const msg: SessionMessage = {
        id: "msg-ok",
        role: "tool",
        content: "ok",
        createdAt: 1000,
      };
      await store.addMessage(session.id, msg);

      const result = await store.get(session.id);
      expect(result?.messages[0]?.isError).toBeUndefined();
    });

    it("should map usage from JSON", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      const msg: SessionMessage = {
        id: "msg-usage",
        role: "assistant",
        content: "done",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        createdAt: 1000,
      };
      await store.addMessage(session.id, msg);

      const result = await store.get(session.id);
      expect(result?.messages[0]?.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });
  });

  describe("list()", () => {
    it("should return empty array when no sessions", async () => {
      const sessions = await store.list();
      expect(sessions).toEqual([]);
    });

    it("should return sessions ordered by updated_at DESC", async () => {
      const s1 = await store.create(TEST_WORKSPACE_ID);
      // Update s1's updated_at by adding a message
      await store.addMessage(s1.id, {
        id: "msg-1",
        role: "user",
        content: "hello",
        createdAt: Date.now(),
      });

      const s2 = await store.create(TEST_WORKSPACE_ID);

      const sessions = await store.list();
      expect(sessions).toHaveLength(2);
      // s2 was created later but s1 has been updated via addMessage
      // s2's updated_at >= s1's createdAt + addMessage update
      expect(sessions[0]?.id).toBe(s2.id);
      expect(sessions[1]?.id).toBe(s1.id);
    });

    it("should not include messages in listed sessions", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      await store.addMessage(session.id, {
        id: "msg-1",
        role: "user",
        content: "hello",
        createdAt: Date.now(),
      });

      const sessions = await store.list();
      expect(sessions[0]?.messages).toEqual([]);
    });
  });

  describe("addMessage()", () => {
    it("should insert message and update session timestamp", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      const originalUpdatedAt = session.updatedAt;

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));

      await store.addMessage(session.id, {
        id: "msg-1",
        role: "user",
        content: "hello",
        createdAt: Date.now(),
      });

      const result = await store.get(session.id);
      expect(result?.messages).toHaveLength(1);
      expect(result?.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });

    it("should store tool_call_id and tool_name", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      const msg: SessionMessage = {
        id: "msg-tool",
        role: "tool",
        content: "result",
        toolCallId: "call-123",
        toolName: "readFile",
        createdAt: 1000,
      };
      await store.addMessage(session.id, msg);

      const result = await store.get(session.id);
      expect(result?.messages[0]?.toolCallId).toBe("call-123");
      expect(result?.messages[0]?.toolName).toBe("readFile");
    });

    it("should store usage as JSON", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      const msg: SessionMessage = {
        id: "msg-usage",
        role: "assistant",
        content: "done",
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        createdAt: 1000,
      };
      await store.addMessage(session.id, msg);

      const result = await store.get(session.id);
      expect(result?.messages[0]?.usage).toEqual({
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
      });
    });
  });

  describe("updateMessages()", () => {
    it("should replace all messages for a session", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      await store.addMessage(session.id, {
        id: "old-msg-1",
        role: "user",
        content: "old",
        createdAt: 1000,
      });

      const newMessages: SessionMessage[] = [
        { id: "new-1", role: "user", content: "new msg 1", createdAt: 2000 },
        {
          id: "new-2",
          role: "assistant",
          content: "new msg 2",
          createdAt: 3000,
        },
      ];
      await store.updateMessages(session.id, newMessages);

      const result = await store.get(session.id);
      expect(result?.messages).toHaveLength(2);
      expect(result?.messages[0]?.id).toBe("new-1");
      expect(result?.messages[1]?.id).toBe("new-2");
    });

    it("should delete all messages when empty array", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      await store.addMessage(session.id, {
        id: "msg-1",
        role: "user",
        content: "hello",
        createdAt: 1000,
      });

      await store.updateMessages(session.id, []);

      const result = await store.get(session.id);
      expect(result?.messages).toEqual([]);
    });

    it("should update session updated_at", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      const originalUpdatedAt = session.updatedAt;

      await new Promise((r) => setTimeout(r, 10));

      await store.updateMessages(session.id, [
        {
          id: "new-1",
          role: "user",
          content: "updated",
          createdAt: Date.now(),
        },
      ]);

      const result = await store.get(session.id);
      expect(result?.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  describe("delete()", () => {
    it("should delete session and associated messages", async () => {
      const session = await store.create(TEST_WORKSPACE_ID);
      await store.addMessage(session.id, {
        id: "msg-1",
        role: "user",
        content: "hello",
        createdAt: 1000,
      });

      await store.delete(session.id);

      const result = await store.get(session.id);
      expect(result).toBeUndefined();
    });

    it("should not throw when session does not exist", async () => {
      await expect(store.delete("non-existent")).resolves.not.toThrow();
    });
  });
});
