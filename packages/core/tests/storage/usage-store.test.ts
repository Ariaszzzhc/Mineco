import { PricingDB } from "@mineco/provider";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/storage/schema.js";
import { SqliteUsageStore } from "../../src/storage/usage-store.js";
import { createTestDb } from "../helper/test-db.js";

describe("SqliteUsageStore", () => {
  let db: Kysely<Database>;
  let store: SqliteUsageStore;
  let pricingDB: PricingDB;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    cleanup = testDb.cleanup;
    pricingDB = new PricingDB();
    pricingDB.setCustomPrice("zhipu", "glm-5", {
      inputPerMillion: 10,
      outputPerMillion: 30,
    });
    store = new SqliteUsageStore(db, pricingDB);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("record()", () => {
    it("should insert raw usage record", async () => {
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        sessionId: "session-1",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const stats = await store.getSummary();
      expect(stats.totalTokens).toBe(150);
      expect(stats.totalRequests).toBe(1);
    });

    it("should calculate cost from pricing", async () => {
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      });

      const stats = await store.getSummary();
      // (1000/1M)*10 + (500/1M)*30 = 0.01 + 0.015 = 0.025
      expect(stats.totalCost).toBeCloseTo(0.025, 6);
    });

    it("should default cost to 0 when no pricing", async () => {
      await store.record({
        providerId: "unknown",
        model: "unknown-model",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const stats = await store.getSummary();
      expect(stats.totalCost).toBe(0);
      expect(stats.totalTokens).toBe(150);
    });

    it("should aggregate daily stats on write", async () => {
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      });

      const today = new Date().toISOString().slice(0, 10)!;
      const daily = await store.getDaily(today, today);
      expect(daily).toHaveLength(1);
      expect(daily[0]!.requests).toBe(2);
      expect(daily[0]!.promptTokens).toBe(300);
      expect(daily[0]!.completionTokens).toBe(150);
      expect(daily[0]!.totalTokens).toBe(450);
    });

    it("should handle multiple providers and models", async () => {
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      await store.record({
        providerId: "deepseek",
        model: "deepseek-v3",
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      });

      const stats = await store.getSummary();
      expect(stats.totalTokens).toBe(450);
      expect(stats.totalRequests).toBe(2);
      expect(stats.byProvider["zhipu"]!.totalTokens).toBe(150);
      expect(stats.byProvider["deepseek"]!.totalTokens).toBe(300);
    });
  });

  describe("getSummary()", () => {
    it("should return empty stats when no records", async () => {
      const stats = await store.getSummary();
      expect(stats.totalTokens).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(Object.keys(stats.byProvider)).toHaveLength(0);
    });
  });

  describe("getDaily()", () => {
    it("should return daily stats for date range", async () => {
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const today = new Date().toISOString().slice(0, 10)!;
      const daily = await store.getDaily(today, today);
      expect(daily).toHaveLength(1);
      expect(daily[0]!.date).toBe(today);
      expect(daily[0]!.providerId).toBe("zhipu");
      expect(daily[0]!.model).toBe("glm-5");
    });

    it("should return empty for non-matching range", async () => {
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const daily = await store.getDaily("2020-01-01", "2020-12-31");
      expect(daily).toHaveLength(0);
    });
  });

  describe("getByModel()", () => {
    it("should aggregate by provider+model across all dates", async () => {
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      });
      await store.record({
        providerId: "zhipu",
        model: "glm-4.7",
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      });

      const byModel = await store.getByModel();
      expect(byModel).toHaveLength(2);
      const glm5 = byModel.find(
        (m) => m.model === "glm-5" && m.providerId === "zhipu",
      );
      expect(glm5!.requests).toBe(2);
      expect(glm5!.totalTokens).toBe(450);
    });

    it("should filter by date range", async () => {
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      const byModel = await store.getByModel("2020-01-01", "2020-12-31");
      expect(byModel).toHaveLength(0);
    });
  });

  describe("getSessionUsage()", () => {
    it("should aggregate usage by session", async () => {
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        sessionId: "session-1",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        sessionId: "session-1",
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      });
      await store.record({
        providerId: "deepseek",
        model: "deepseek-v3",
        sessionId: "session-1",
        usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      });

      const stats = await store.getSessionUsage("session-1");
      expect(stats.sessionId).toBe("session-1");
      expect(stats.totalTokens).toBe(525);
      expect(stats.totalRequests).toBe(3);
      expect(stats.byModel).toHaveLength(2);
    });

    it("should return empty for non-existent session", async () => {
      const stats = await store.getSessionUsage("non-existent");
      expect(stats.totalTokens).toBe(0);
      expect(stats.totalCost).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.byModel).toHaveLength(0);
    });

    it("should only include records with matching session", async () => {
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        sessionId: "session-1",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });
      await store.record({
        providerId: "zhipu",
        model: "glm-5",
        sessionId: "session-2",
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      });

      const stats = await store.getSessionUsage("session-1");
      expect(stats.totalTokens).toBe(150);
      expect(stats.totalRequests).toBe(1);
    });
  });
});
