import { Hono } from "hono";
import type { SessionStore } from "@mineco/agent";

export function createSessionRoutes(store: SessionStore): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const session = await store.create();
    return c.json(session);
  });

  app.get("/", async (c) => {
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
