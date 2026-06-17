import type { DatabaseSync } from "node:sqlite";

/**
 * Lightweight version-stepped migrations (EDD §11 / ADR-5) over
 * `PRAGMA user_version`, run on the raw `DatabaseSync` BEFORE the Kysely wrap
 * (multi-statement DDL can't go through Kysely's one-statement prepare path).
 *
 * mineco.db holds ONLY runtime state — four tables (workspaces / sessions /
 * turns / messages). Agents, MCP, skills, memory, and app settings are
 * filesystem-backed and never live here.
 *
 * Every migration must be idempotent and tolerant of the existing dev DB (which
 * may already have these columns, plus legacy tables from earlier prototypes).
 * Legacy tables (agents / mcp_servers / skills / memory_entries / app_settings)
 * are LEFT IN PLACE unused — we never drop them and never error on their
 * presence.
 */

/** v1 baseline: the four runtime tables. `IF NOT EXISTS` makes it a no-op on an
 * existing DB; additive column guards below reconcile partial older shapes. */
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
`;

/** The latest schema version this build understands. */
const LATEST_VERSION = 1;

/** Returns whether `table` has a column named `column` (false if the table is
 * absent). */
function hasColumn(
  sqlite: DatabaseSync,
  table: string,
  column: string,
): boolean {
  try {
    const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    return rows.some((r) => r.name === column);
  } catch {
    return false;
  }
}

/** Adds `column` to `table` if missing. Tolerant of an absent table / a racing
 * duplicate. */
function addColumn(
  sqlite: DatabaseSync,
  table: string,
  column: string,
  ddl: string,
): void {
  if (hasColumn(sqlite, table, column)) return;
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  } catch {
    // Table missing or column already added concurrently — safe to ignore.
  }
}

/**
 * Reconciles a pre-existing dev DB to the v1 baseline shape. `CREATE TABLE IF
 * NOT EXISTS` won't add columns to a table that already exists, and
 * `node:sqlite` throws on a duplicate-column `ALTER`, so each additive column is
 * guarded by a `table_info` check.
 */
function reconcileV1(sqlite: DatabaseSync): void {
  // workspaces: older prototypes used `path`; the runtime shape is root_path +
  // last-selection pointers.
  addColumn(sqlite, "workspaces", "root_path", "root_path TEXT");
  addColumn(sqlite, "workspaces", "last_mode", "last_mode TEXT");
  addColumn(sqlite, "workspaces", "last_agent_id", "last_agent_id TEXT");

  // sessions: gained workspace_id + agent_id; the old `status` column (if
  // present) is left in place, unused (run state is in-memory now).
  addColumn(sqlite, "sessions", "workspace_id", "workspace_id TEXT");
  addColumn(sqlite, "sessions", "agent_id", "agent_id TEXT");

  // turns: mode is now a string id with a human label; agent_id retained.
  addColumn(sqlite, "turns", "agent_id", "agent_id TEXT NOT NULL DEFAULT ''");
  addColumn(sqlite, "turns", "mode", "mode TEXT");
  addColumn(sqlite, "turns", "mode_label", "mode_label TEXT");
  addColumn(sqlite, "turns", "model", "model TEXT");

  // messages: reasoning + tools columns.
  addColumn(
    sqlite,
    "messages",
    "reasoning",
    "reasoning TEXT NOT NULL DEFAULT ''",
  );
  addColumn(sqlite, "messages", "tools", "tools TEXT NOT NULL DEFAULT '[]'");
}

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
    reconcileV1(sqlite);
    version = 1;
  }

  // Future steps (v1 -> v2, …) go here, each guarded by `if (version < N)`.

  if (version !== Number(row?.user_version ?? 0)) {
    sqlite.exec(`PRAGMA user_version = ${LATEST_VERSION}`);
  }
}
