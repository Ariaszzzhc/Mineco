import type { DatabaseSync } from "node:sqlite";

/**
 * Schema bootstrap (EDD §11 / ADR-5) over `PRAGMA user_version`, run on the raw
 * `DatabaseSync` BEFORE the Kysely wrap (multi-statement DDL can't go through
 * Kysely's one-statement prepare path).
 *
 * mineco.db holds ONLY runtime state — four tables (workspaces / sessions /
 * turns / messages). Agents, MCP, skills, memory, and app settings are
 * filesystem-backed and never live here.
 *
 * There is a single baseline migration: create the canonical tables. The DB is
 * created fresh on first launch; we do NOT upgrade older prototype databases in
 * place — delete a stale `~/.mineco/mineco.db` to regenerate.
 */

/** v1 baseline: the four runtime tables + their indexes. */
const V1_BASELINE = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    root_path     TEXT,
    last_mode     TEXT,
    last_agent_id TEXT,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT,
    agent_id     TEXT,
    title        TEXT NOT NULL,
    cwd          TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS turns (
    id               TEXT PRIMARY KEY,
    session_id       TEXT NOT NULL,
    agent_id         TEXT NOT NULL,
    mode             TEXT,
    mode_label       TEXT,
    model            TEXT,
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

  CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
`;

/** The latest schema version this build understands. */
const LATEST_VERSION = 1;

/**
 * Steps the database up to {@link LATEST_VERSION} using `PRAGMA user_version`.
 * Each step is idempotent. Runs on the raw `DatabaseSync` before the Kysely
 * wrap.
 */
export function runMigrations(sqlite: DatabaseSync): void {
  const row = sqlite.prepare("PRAGMA user_version").get() as
    | { user_version?: number }
    | undefined;
  let version = Number(row?.user_version ?? 0);

  if (version < 1) {
    sqlite.exec(V1_BASELINE);
    version = 1;
  }

  // Future steps (v1 -> v2, …) go here, each guarded by `if (version < N)`.

  if (version !== Number(row?.user_version ?? 0)) {
    sqlite.exec(`PRAGMA user_version = ${LATEST_VERSION}`);
  }
}
