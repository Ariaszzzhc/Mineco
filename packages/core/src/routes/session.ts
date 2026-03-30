import { Hono } from "hono";
import type { SessionStore } from "@mineco/agent";

export function createSessionRoutes(store: SessionStore): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const body = await c.req.json<{ workspaceId?: string }>();
    if (!body.workspaceId) {
      return c.json({ error: "workspaceId is required" }, 400);
    }
    const session = await store.create(body.workspaceId);
    return c.json(session);
  });

  app.get("/", async (c) => {
    const workspaceId = c.req.query("workspaceId");
    if (workspaceId) {
      const sessions = await store.listByWorkspace(workspaceId);
      return c.json(sessions);
    }
    const sessions = await store.list();
    return c.json(sessions);
  });

  app.get("/:id", async (c) => {
    const session = await store.get(c.req.param("id"));
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(session);
  });

  app.delete("/:id", async (c) => {
    await store.delete(c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
