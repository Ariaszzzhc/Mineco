import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createWorkspaceSchema } from "../config/schema.js";
import { getCurrentBranch, getGitRoot, isGitRepo } from "../lib/git.js";
import type { SqliteWorkspaceStore } from "../storage/workspace-store.js";

export function createWorkspaceRoutes(store: SqliteWorkspaceStore) {
  return new Hono()
    .get("/", async (c) => {
      const workspaces = await store.list();
      return c.json(workspaces);
    })
    .post("/", zValidator("json", createWorkspaceSchema), async (c) => {
      const { path } = c.req.valid("json");

      // If workspace already exists for this path, just reopen it
      const existing = await store.findByPath(path);
      if (existing) {
        await store.updateLastOpened(existing.id);
        return c.json(existing);
      }

      const workspace = await store.create(path);
      return c.json(workspace);
    })
    .get("/:id", async (c) => {
      const workspace = await store.get(c.req.param("id"));
      if (!workspace) return c.json({ error: "Workspace not found" }, 404);
      return c.json(workspace);
    })
    .post("/:id/open", async (c) => {
      const workspace = await store.get(c.req.param("id"));
      if (!workspace) return c.json({ error: "Workspace not found" }, 404);
      await store.updateLastOpened(workspace.id);
      return c.json(workspace);
    })
    .get("/:id/git-info", async (c) => {
      const workspace = await store.get(c.req.param("id"));
      if (!workspace) return c.json({ error: "Workspace not found" }, 404);

      const isRepo = await isGitRepo(workspace.path);
      if (!isRepo) {
        return c.json({ isGitRepo: false, gitRoot: null, currentBranch: null });
      }

      const gitRoot = await getGitRoot(workspace.path);
      const currentBranch = gitRoot ? await getCurrentBranch(gitRoot) : null;

      return c.json({ isGitRepo: true, gitRoot, currentBranch });
    })
    .delete("/:id", async (c) => {
      await store.delete(c.req.param("id"));
      return c.json({ ok: true });
    });
}
