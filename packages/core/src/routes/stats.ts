import { Hono } from "hono";
import type { SqliteUsageStore } from "../storage/usage-store.js";

export function createStatsRoutes(usageStore: SqliteUsageStore) {
  return new Hono()
    .get("/summary", async (c) => {
      const stats = await usageStore.getSummary();
      return c.json(stats);
    })
    .get("/daily", async (c) => {
      const from = c.req.query("from");
      const to = c.req.query("to");
      if (!from || !to) {
        return c.json({ error: "from and to query params are required" }, 400);
      }
      const stats = await usageStore.getDaily(from, to);
      return c.json(stats);
    })
    .get("/by-model", async (c) => {
      const from = c.req.query("from");
      const to = c.req.query("to");
      const stats = await usageStore.getByModel(from, to);
      return c.json(stats);
    })
    .get("/sessions/:id", async (c) => {
      const sessionId = c.req.param("id");
      const stats = await usageStore.getSessionUsage(sessionId);
      return c.json(stats);
    });
}
