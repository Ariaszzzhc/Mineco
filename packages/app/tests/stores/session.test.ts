import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestSession } from "../helper/fixture";

const mockApi = vi.hoisted(() => ({
  listSessions: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("../../src/lib/api-client", () => ({
  api: mockApi,
}));

import { sessionStore } from "../../src/stores/session";

describe("sessionStore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset store state
    mockApi.listSessions.mockResolvedValue([]);
    await sessionStore.loadSessions();
  });

  it("should return empty sessions initially", () => {
    expect(sessionStore.sessions()).toEqual([]);
  });

  it("should return null currentSession initially", () => {
    expect(sessionStore.currentSession()).toBeNull();
  });

  it("should return false loading initially", () => {
    expect(sessionStore.loading()).toBe(false);
  });

  describe("loadSessions", () => {
    it("should populate sessions from API", async () => {
      const sessions = [
        createTestSession({ id: "1" }),
        createTestSession({ id: "2" }),
      ];
      mockApi.listSessions.mockResolvedValue(sessions);
      await sessionStore.loadSessions();
      expect(sessionStore.sessions()).toEqual(sessions);
    });

    it("should set loading to false in finally", async () => {
      mockApi.listSessions.mockRejectedValue(new Error("fail"));
      await expect(sessionStore.loadSessions()).rejects.toThrow("fail");
      expect(sessionStore.loading()).toBe(false);
    });
  });

  describe("selectSession", () => {
    it("should set currentSession from API", async () => {
      const session = createTestSession({ id: "abc" });
      mockApi.getSession.mockResolvedValue(session);
      await sessionStore.selectSession("abc");
      expect(sessionStore.currentSession()).toEqual(session);
    });

    it("should set currentSession to null on error", async () => {
      // First set a current session
      const session = createTestSession();
      mockApi.getSession.mockResolvedValue(session);
      await sessionStore.selectSession("1");
      expect(sessionStore.currentSession()).not.toBeNull();

      // Then fail
      mockApi.getSession.mockRejectedValue(new Error("not found"));
      await sessionStore.selectSession("bad-id");
      expect(sessionStore.currentSession()).toBeNull();
    });

    it("should set loading to false in finally", async () => {
      mockApi.getSession.mockRejectedValue(new Error("fail"));
      await sessionStore.selectSession("1");
      expect(sessionStore.loading()).toBe(false);
    });
  });

  describe("addSession", () => {
    it("should prepend session to array", async () => {
      const existing = createTestSession({ id: "1" });
      mockApi.listSessions.mockResolvedValue([existing]);
      await sessionStore.loadSessions();

      const newSession = createTestSession({ id: "2" });
      sessionStore.addSession(newSession);

      expect(sessionStore.sessions()).toHaveLength(2);
      expect(sessionStore.sessions()[0]).toEqual({ ...newSession, running: false });
    });
  });

  describe("removeSession", () => {
    it("should remove session from array", async () => {
      const s1 = createTestSession({ id: "1" });
      const s2 = createTestSession({ id: "2" });
      mockApi.listSessions.mockResolvedValue([s1, s2]);
      await sessionStore.loadSessions();

      sessionStore.removeSession("1");
      expect(sessionStore.sessions()).toHaveLength(1);
      expect(sessionStore.sessions()[0]?.id).toBe("2");
    });

    it("should clear currentSession if it matches removed id", async () => {
      const session = createTestSession({ id: "1" });
      mockApi.getSession.mockResolvedValue(session);
      await sessionStore.selectSession("1");
      expect(sessionStore.currentSession()).not.toBeNull();

      sessionStore.removeSession("1");
      expect(sessionStore.currentSession()).toBeNull();
    });

    it("should not clear currentSession if it does not match", async () => {
      const s1 = createTestSession({ id: "1" });
      const s2 = createTestSession({ id: "2" });
      mockApi.listSessions.mockResolvedValue([s1, s2]);
      await sessionStore.loadSessions();
      mockApi.getSession.mockResolvedValue(s1);
      await sessionStore.selectSession("1");

      sessionStore.removeSession("2");
      expect(sessionStore.currentSession()?.id).toBe("1");
    });
  });

  describe("refreshCurrentSession", () => {
    it("should do nothing when no currentSession", async () => {
      // Force clear currentSession by triggering selectSession error
      mockApi.getSession.mockRejectedValue(new Error("not found"));
      await sessionStore.selectSession("_clear_");
      expect(sessionStore.currentSession()).toBeNull();

      const callCountBefore = mockApi.getSession.mock.calls.length;
      await sessionStore.refreshCurrentSession();
      expect(mockApi.getSession.mock.calls.length).toBe(callCountBefore);
    });

    it("should update currentSession from API", async () => {
      const session = createTestSession({ id: "1" });
      mockApi.getSession.mockResolvedValue(session);
      await sessionStore.selectSession("1");

      const updated = createTestSession({
        id: "1",
        title: "Updated",
        messages: [{ id: "m1", role: "user", content: "hi", createdAt: 1000 }],
      });
      mockApi.getSession.mockResolvedValue(updated);
      await sessionStore.refreshCurrentSession();

      expect(sessionStore.currentSession()).toEqual(updated);
    });

    it("should update session in sessions list", async () => {
      const s1 = createTestSession({ id: "1" });
      const s2 = createTestSession({ id: "2" });
      mockApi.listSessions.mockResolvedValue([s1, s2]);
      await sessionStore.loadSessions();

      mockApi.getSession.mockResolvedValue(s1);
      await sessionStore.selectSession("1");

      const updated = createTestSession({ id: "1", title: "Updated" });
      mockApi.getSession.mockResolvedValue(updated);
      await sessionStore.refreshCurrentSession();

      expect(sessionStore.sessions()[0]).toEqual(updated);
    });
  });
});
