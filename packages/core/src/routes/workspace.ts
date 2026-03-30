import { Hono } from "hono";
import type { SqliteWorkspaceStore } from "../storage/workspace-store.js";

export function createWorkspaceRoutes(store: SqliteWorkspaceStore): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const workspaces = await store.list();
    return c.json(workspaces);
  });

  app.post("/", async (c) => {
    const body = await c.req.json<{ path?: string }>();
    if (!body.path?.trim()) {
      return c.json({ error: "path is required" }, 400);
    }

    // If workspace already exists for this path, just reopen it
    const existing = await store.findByPath(body.path);
    if (existing) {
      await store.updateLastOpened(existing.id);
      return c.json(existing);
    }

    const workspace = await store.create(body.path);
    return c.json(workspace);
  });

  app.get("/:id", async (c) => {
    const workspace = await store.get(c.req.param("id"));
    if (!workspace) return c.json({ error: "Workspace not found" }, 404);
    return c.json(workspace);
  });

  app.post("/:id/open", async (c) => {
    const workspace = await store.get(c.req.param("id"));
    if (!workspace) return c.json({ error: "Workspace not found" }, 404);
    await store.updateLastOpened(workspace.id);
    return c.json(workspace);
  });

  app.delete("/:id", async (c) => {
    await store.delete(c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
