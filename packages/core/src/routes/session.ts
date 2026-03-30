import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createSessionSchema } from "../config/schema.js";
import type { SessionStore } from "@mineco/agent";

export function createSessionRoutes(store: SessionStore) {
  return new Hono()
    .post("/", zValidator("json", createSessionSchema), async (c) => {
      const { workspaceId } = c.req.valid("json");
      const session = await store.create(workspaceId);
      return c.json(session);
    })
    .get("/", async (c) => {
      const workspaceId = c.req.query("workspaceId");
      if (workspaceId) {
        const sessions = await store.listByWorkspace(workspaceId);
        return c.json(sessions);
      }
      const sessions = await store.list();
      return c.json(sessions);
    })
    .get("/:id", async (c) => {
      const session = await store.get(c.req.param("id"));
      if (!session) return c.json({ error: "Session not found" }, 404);
      return c.json(session);
    })
    .delete("/:id", async (c) => {
      await store.delete(c.req.param("id"));
      return c.json({ ok: true });
    });
}
