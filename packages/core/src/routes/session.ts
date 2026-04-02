import { zValidator } from "@hono/zod-validator";
import type { SessionStore } from "@mineco/agent";
import { Hono } from "hono";
import { z } from "zod";
import { createSessionSchema, updateSessionSchema } from "../config/schema.js";
import type { SqliteSessionNotesStore } from "../storage/session-notes-store.js";

export function createSessionRoutes(
  store: SessionStore,
  notesStore?: SqliteSessionNotesStore,
) {
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
