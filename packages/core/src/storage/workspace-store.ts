import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { Kysely } from "kysely";
import type { Database } from "./schema.js";

export interface Workspace {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: number;
  createdAt: number;
}

export class SqliteWorkspaceStore {
  constructor(private db: Kysely<Database>) {}

  async create(path: string): Promise<Workspace> {
    const now = Date.now();
    const id = randomUUID();
    const name = basename(path);

    await this.db
      .insertInto("workspaces")
      .values({ id, path, name, last_opened_at: now, created_at: now })
      .execute();

    return { id, path, name, lastOpenedAt: now, createdAt: now };
  }

  async get(id: string): Promise<Workspace | undefined> {
    const row = await this.db
      .selectFrom("workspaces")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return undefined;

    return {
      id: row.id,
      path: row.path,
      name: row.name,
      lastOpenedAt: row.last_opened_at,
      createdAt: row.created_at,
    };
  }

  async findByPath(path: string): Promise<Workspace | undefined> {
    const row = await this.db
      .selectFrom("workspaces")
      .selectAll()
      .where("path", "=", path)
      .executeTakeFirst();

    if (!row) return undefined;

    return {
      id: row.id,
      path: row.path,
      name: row.name,
      lastOpenedAt: row.last_opened_at,
      createdAt: row.created_at,
    };
  }

  async list(): Promise<Workspace[]> {
    const rows = await this.db
      .selectFrom("workspaces")
      .selectAll()
      .orderBy("last_opened_at", "desc")
      .execute();

    return rows.map((r) => ({
      id: r.id,
      path: r.path,
      name: r.name,
      lastOpenedAt: r.last_opened_at,
      createdAt: r.created_at,
    }));
  }

  async updateLastOpened(id: string): Promise<void> {
    await this.db
      .updateTable("workspaces")
      .set({ last_opened_at: Date.now() })
      .where("id", "=", id)
      .execute();
  }

  async delete(id: string): Promise<void> {
    await this.db
      .deleteFrom("messages")
      .innerJoin("sessions", "messages.session_id", "sessions.id")
      .where("sessions.workspace_id", "=", id)
      .execute();
    await this.db
      .deleteFrom("sessions")
      .where("workspace_id", "=", id)
      .execute();
    await this.db.deleteFrom("workspaces").where("id", "=", id).execute();
  }
}
