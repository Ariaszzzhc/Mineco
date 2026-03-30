import { describe, expect, it, beforeEach, vi } from "vitest";
import { createSessionRoutes } from "../../src/routes/session.js";
import { createMockSessionStore } from "../helper/mock-session-store.js";
import type { Session } from "@mineco/agent";

describe("Session Routes", () => {
  let store: ReturnType<typeof createMockSessionStore>;
  let app: ReturnType<typeof createSessionRoutes>;

  beforeEach(() => {
    store = createMockSessionStore();
    app = createSessionRoutes(store);
  });

  describe("POST /", () => {
    it("should create a session and return 200", async () => {
      const res = await app.request("/", {
        method: "POST",
        body: JSON.stringify({ workspaceId: "ws-1" }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.title).toBe("New Session");
      expect(body.messages).toEqual([]);
      expect(store.create).toHaveBeenCalledWith("ws-1");
    });
  });

  describe("GET /", () => {
    it("should return empty array when no sessions", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
      expect(store.list).toHaveBeenCalledOnce();
    });

    it("should return sessions from store", async () => {
      const sessions: Session[] = [
        {
          id: "s1",
          title: "Session 1",
          workspaceId: "ws-1",
          messages: [],
          createdAt: 1000,
          updatedAt: 2000,
        },
      ];
      store.list = vi.fn(async () => sessions);

      const res = await app.request("/");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe("s1");
    });
  });

  describe("GET /:id", () => {
    it("should return session when found", async () => {
      const session: Session = {
        id: "test-id",
        title: "Test",
        workspaceId: "ws-1",
        messages: [],
        createdAt: 1000,
        updatedAt: 2000,
      };
      store.get = vi.fn(async () => session);

      const res = await app.request("/test-id");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("test-id");
      expect(store.get).toHaveBeenCalledWith("test-id");
    });

    it("should return 404 when session not found", async () => {
      const res = await app.request("/non-existent");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Session not found");
    });
  });

  describe("DELETE /:id", () => {
    it("should delete session and return 200", async () => {
      const res = await app.request("/test-id", { method: "DELETE" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(store.delete).toHaveBeenCalledWith("test-id");
    });
  });
});
