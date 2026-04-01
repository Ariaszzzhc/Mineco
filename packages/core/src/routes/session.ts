import { zValidator } from "@hono/zod-validator";
import type { SessionStore } from "@mineco/agent";
import { Hono } from "hono";
import { createSessionSchema, updateSessionSchema } from "../config/schema.js";

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
    .patch("/:id", zValidator("json", updateSessionSchema), async (c) => {
      const { title } = c.req.valid("json");
      await store.updateTitle(c.req.param("id"), title);
      return c.json({ ok: true });
    })
    .delete("/:id", async (c) => {
      await store.delete(c.req.param("id"));
      return c.json({ ok: true });
    });
}
