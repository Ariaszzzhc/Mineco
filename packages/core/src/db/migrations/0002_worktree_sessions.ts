import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE sessions ADD COLUMN worktree_path TEXT`.execute(db);
  await sql`ALTER TABLE sessions ADD COLUMN worktree_branch TEXT`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't support DROP COLUMN before 3.35.0,
  // so we recreate the table without the worktree columns.
  await sql`CREATE TABLE sessions_backup (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Session',
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`.execute(db);

  await sql`INSERT INTO sessions_backup (id, title, workspace_id, created_at, updated_at)
    SELECT id, title, workspace_id, created_at, updated_at FROM sessions`.execute(
    db,
  );

  await sql`DROP TABLE sessions`.execute(db);
  await sql`ALTER TABLE sessions_backup RENAME TO sessions`.execute(db);
}
