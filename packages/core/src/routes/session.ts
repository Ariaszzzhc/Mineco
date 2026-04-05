import { zValidator } from "@hono/zod-validator";
import type { SessionStore } from "@mineco/agent";
import { Hono } from "hono";
import { z } from "zod";
import { createSessionSchema, updateSessionSchema } from "../config/schema.js";
import type { SqliteSessionNotesStore } from "../storage/session-notes-store.js";
import type { SessionRunManager } from "../storage/session-run-manager.js";

export function createSessionRoutes(
  store: SessionStore,
  notesStore?: SqliteSessionNotesStore,
  runManager?: SessionRunManager,
) {
  return new Hono()
    .post("/", zValidator("json", createSessionSchema), async (c) => {
      const { workspaceId } = c.req.valid("json");
      const session = await store.create(workspaceId);
      return c.json(session);
    })
    .get("/", async (c) => {
      const workspaceId = c.req.query("workspaceId");
      const sessions = workspaceId
        ? await store.listByWorkspace(workspaceId)
        : await store.list();
      return c.json(
        sessions.map((s) => ({
          ...s,
          running: runManager?.isRunning(s.id) ?? false,
        })),
      );
    })
    .get("/:id/status", async (c) => {
      const sessionId = c.req.param("id");
      const run = runManager?.getRun(sessionId);
      return c.json({
        sessionId,
        running: !!run,
        startedAt: run?.startedAt ?? null,
      });
    })
    .get("/:id", async (c) => {
      const session = await store.get(c.req.param("id"));
      if (!session) return c.json({ error: "Session not found" }, 404);
      return c.json({
        ...session,
        running: runManager?.isRunning(session.id) ?? false,
      });
    })
    .post("/:id/abort", async (c) => {
      const sessionId = c.req.param("id");
      if (!runManager) {
        return c.json({ error: "Run manager not available" }, 503);
      }
      const aborted = runManager.abort(sessionId);
      if (!aborted) {
        return c.json({ error: "Session is not running" }, 404);
      }
      return c.json({ ok: true });
    })
    .patch("/:id", zValidator("json", updateSessionSchema), async (c) => {
      const { title } = c.req.valid("json");
      await store.updateTitle(c.req.param("id"), title);
      return c.json({ ok: true });
    })
    .delete("/:id", async (c) => {
      // Abort if running before deleting
      runManager?.abort(c.req.param("id"));
      await store.delete(c.req.param("id"));
      return c.json({ ok: true });
    })
    .get("/:id/notes", async (c) => {
      if (!notesStore) return c.json([]);
      const notes = await notesStore.getNotes(c.req.param("id"));
      return c.json(notes);
    })
    .patch(
      "/:id/notes/:noteId",
      zValidator("json", z.object({ content: z.string() })),
      async (c) => {
        if (!notesStore) return c.json({ error: "Notes not available" }, 503);
        const noteId = c.req.param("noteId");
        const existing = await notesStore.getNote(noteId);
        if (!existing) return c.json({ error: "Note not found" }, 404);
        const { content } = c.req.valid("json");
        await notesStore.updateNoteContent(noteId, content);
        return c.json({ ok: true });
      },
    )
    .delete("/:id/notes/:noteId", async (c) => {
      if (!notesStore) return c.json({ error: "Notes not available" }, 503);
      const noteId = c.req.param("noteId");
      const existing = await notesStore.getNote(noteId);
      if (!existing) return c.json({ error: "Note not found" }, 404);
      await notesStore.deleteNote(noteId);
      return c.json({ ok: true });
    });
}
