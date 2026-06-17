import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CamelCasePlugin, Kysely } from "kysely";
import { NodeSqliteDialect } from "./node-sqlite-dialect";
import type { Database } from "./schema";

/**
 * SQLite persistence for mineco, via Node 24's built-in `node:sqlite` (Electron
 * 42 bundles Node 24, so there is no native module to rebuild against the
 * Electron ABI). Queries go through Kysely on top of an inlined `node:sqlite`
 * dialect; the DDL below runs once on the raw connection (it is multi-statement,
 * which Kysely's one-statement-per-prepare path can't execute). Stores agent
 * config, workspaces/memory/MCP/skills, and the canonical engine-neutral
 * transcript at `~/.mineco/mineco.db`.
 */

let db: Kysely<Database> | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS agents (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    engine        TEXT NOT NULL,
    base_url      TEXT NOT NULL DEFAULT '',
    api_key       TEXT NOT NULL DEFAULT '',
    models_json   TEXT NOT NULL DEFAULT '{}',
    model         TEXT NOT NULL DEFAULT '',
    effort        TEXT NOT NULL DEFAULT 'medium',
    system_prompt TEXT NOT NULL DEFAULT '',
    prompt_mode   TEXT NOT NULL DEFAULT 'append',
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    path        TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT,
    title        TEXT NOT NULL,
    cwd          TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'idle',
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS turns (
    id               TEXT PRIMARY KEY,
    session_id       TEXT NOT NULL,
    agent_id         TEXT NOT NULL,
    engine           TEXT NOT NULL,
    mode             TEXT NOT NULL DEFAULT 'default',
    model            TEXT NOT NULL DEFAULT '',
    native_thread_id TEXT,
    usage_json       TEXT,
    status           TEXT NOT NULL,
    created_at       INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    turn_id     TEXT NOT NULL,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    reasoning   TEXT NOT NULL DEFAULT '',
    tools       TEXT NOT NULL DEFAULT '[]',
    engine      TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memory_entries (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    kind         TEXT NOT NULL,
    text         TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mcp_servers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    transport   TEXT NOT NULL DEFAULT 'stdio',
    scope       TEXT NOT NULL DEFAULT 'global',
    enabled     INTEGER NOT NULL DEFAULT 1,
    command     TEXT NOT NULL DEFAULT '',
    env         TEXT NOT NULL DEFAULT '{}',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS skills (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    scope       TEXT NOT NULL DEFAULT 'global',
    source      TEXT NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    id              TEXT PRIMARY KEY,
    appearance_json TEXT NOT NULL
  );
`;

/**
 * Indexes are created AFTER {@link migrate} — several reference columns that
 * older databases gain only via the additive migration (e.g. `workspace_id`),
 * so creating them as part of `SCHEMA` (which runs before migration) would
 * throw "no such column" on an existing table and abort startup.
 */
const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_memory_workspace ON memory_entries(workspace_id, created_at);
`;

/**
 * Additive column migrations for pre-existing databases. `CREATE TABLE IF NOT
 * EXISTS` won't add columns to a table that already exists, and `node:sqlite`
 * throws on a duplicate-column `ALTER`, so each statement is guarded by a
 * table_info check. Run once, before the Kysely wrap, on the raw connection.
 *
 * The legacy `provider_profiles` table (if present) is left in place — the new
 * `agents` table is created fresh; we don't attempt to migrate old profiles.
 */
function migrate(sqlite: DatabaseSync): void {
  const hasColumn = (table: string, column: string): boolean => {
    try {
      const rows = sqlite
        .prepare(`PRAGMA table_info(${table})`)
        .all() as Array<{ name: string }>;
      return rows.some((r) => r.name === column);
    } catch {
      return false;
    }
  };

  const addColumn = (table: string, column: string, ddl: string): void => {
    if (hasColumn(table, column)) return;
    try {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    } catch {
      // Column already exists / table missing — safe to ignore.
    }
  };

  // agents: tolerate a partial older shape.
  addColumn("agents", "base_url", "base_url TEXT NOT NULL DEFAULT ''");
  addColumn("agents", "api_key", "api_key TEXT NOT NULL DEFAULT ''");
  addColumn("agents", "models_json", "models_json TEXT NOT NULL DEFAULT '{}'");
  addColumn("agents", "model", "model TEXT NOT NULL DEFAULT ''");
  addColumn("agents", "effort", "effort TEXT NOT NULL DEFAULT 'medium'");
  addColumn(
    "agents",
    "system_prompt",
    "system_prompt TEXT NOT NULL DEFAULT ''",
  );
  addColumn(
    "agents",
    "prompt_mode",
    "prompt_mode TEXT NOT NULL DEFAULT 'append'",
  );

  // sessions: gained workspace_id + status.
  addColumn("sessions", "workspace_id", "workspace_id TEXT");
  addColumn("sessions", "status", "status TEXT NOT NULL DEFAULT 'idle'");

  // turns: gained mode + model; profile_id may still exist (left untouched).
  addColumn("turns", "agent_id", "agent_id TEXT NOT NULL DEFAULT ''");
  addColumn("turns", "mode", "mode TEXT NOT NULL DEFAULT 'default'");
  addColumn("turns", "model", "model TEXT NOT NULL DEFAULT ''");

  // messages: gained reasoning + tools.
  addColumn("messages", "reasoning", "reasoning TEXT NOT NULL DEFAULT ''");
  addColumn("messages", "tools", "tools TEXT NOT NULL DEFAULT '[]'");
}

/** Opens (once) and returns the shared Kysely database, creating tables on
 * first use and applying additive column migrations. */
export function getDb(): Kysely<Database> {
  if (db) return db;
  const dir = path.join(os.homedir(), ".mineco");
  fs.mkdirSync(dir, { recursive: true });
  const sqlite = new DatabaseSync(path.join(dir, "mineco.db"));
  sqlite.exec(SCHEMA);
  migrate(sqlite);
  sqlite.exec(INDEXES);
  db = new Kysely<Database>({
    dialect: new NodeSqliteDialect(sqlite),
    plugins: [new CamelCasePlugin()],
  });
  return db;
}
