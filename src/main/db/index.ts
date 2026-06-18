import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CamelCasePlugin, Kysely } from "kysely";
import { runMigrations } from "./migrations";
import { NodeSqliteDialect } from "./node-sqlite-dialect";
import type { Database } from "./schema";

/**
 * SQLite persistence for mineco, via Node 24's built-in `node:sqlite` (Electron
 * 42 bundles Node 24, so there is no native module to rebuild against the
 * Electron ABI). Queries go through Kysely on top of an inlined `node:sqlite`
 * dialect.
 *
 * mineco.db holds ONLY runtime state — four tables (workspaces / sessions /
 * turns / messages). Agents, MCP, skills, memory, and app settings are
 * filesystem-backed (EDD §4.1). Schema versioning lives in `migrations.ts`
 * (`PRAGMA user_version`), run on the raw connection before the Kysely wrap;
 * indexes are created afterwards (they reference columns the migration may have
 * just added). The DB file lives at `~/.mineco/mineco.db`.
 */

let db: Kysely<Database> | null = null;

/**
 * Indexes are created AFTER {@link runMigrations} — several reference columns
 * that older databases gain only via the additive migration (e.g.
 * `workspace_id`), so creating them earlier would throw "no such column" on an
 * existing table and abort startup.
 */
const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id, created_at);
`;

/** Opens (once) and returns the shared Kysely database, applying versioned
 * migrations and creating indexes on first use. */
export function getDb(): Kysely<Database> {
  if (db) return db;
  const dir = path.join(os.homedir(), ".mineco");
  fs.mkdirSync(dir, { recursive: true });
  const sqlite = new DatabaseSync(path.join(dir, "mineco.db"));
  runMigrations(sqlite);
  sqlite.exec(INDEXES);
  db = new Kysely<Database>({
    dialect: new NodeSqliteDialect(sqlite),
    plugins: [new CamelCasePlugin()],
  });
  return db;
}
