import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "./schema.js";

export interface SessionNote {
  id: string;
  sessionId: string;
  content: string;
  noteType: string;
  tokenCount: number;
  createdAt: number;
  updatedAt: number;
}

export class SqliteSessionNotesStore {
  constructor(private db: Kysely<Database>) {}

  async getNotes(sessionId: string): Promise<SessionNote[]> {
    const rows = await this.db
      .selectFrom("session_notes")
      .selectAll()
      .where("session_id", "=", sessionId)
      .orderBy("created_at", "asc")
      .execute();

    return rows.map(rowToNote);
  }

  async upsertAutoNote(
    sessionId: string,
    content: string,
    tokenCount: number,
  ): Promise<SessionNote> {
    const existing = await this.db
      .selectFrom("session_notes")
      .selectAll()
      .where("session_id", "=", sessionId)
      .where("note_type", "=", "auto-extracted")
      .executeTakeFirst();

    const now = Date.now();

    if (existing) {
      await this.db
        .updateTable("session_notes")
        .set({
          content,
          token_count: tokenCount,
          updated_at: now,
        })
        .where("id", "=", existing.id)
        .execute();

      return {
        id: existing.id,
        sessionId,
        content,
        noteType: "auto-extracted",
        tokenCount,
        createdAt: existing.created_at,
        updatedAt: now,
      };
    }

    const id = randomUUID();
    await this.db
      .insertInto("session_notes")
      .values({
        id,
        session_id: sessionId,
        content,
        note_type: "auto-extracted",
        token_count: tokenCount,
        created_at: now,
        updated_at: now,
      })
      .execute();

    return {
      id,
      sessionId,
      content,
      noteType: "auto-extracted",
      tokenCount,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateNoteContent(
    id: string,
    content: string,
  ): Promise<void> {
    await this.db
      .updateTable("session_notes")
      .set({
        content,
        updated_at: Date.now(),
      })
      .where("id", "=", id)
      .execute();
  }

  async deleteNote(id: string): Promise<void> {
    await this.db.deleteFrom("session_notes").where("id", "=", id).execute();
  }
}

function rowToNote(row: Database["session_notes"]): SessionNote {
  return {
    id: row.id,
    sessionId: row.session_id,
    content: row.content,
    noteType: row.note_type,
    tokenCount: row.token_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
