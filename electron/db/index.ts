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
 * which Kysely's one-statement-per-prepare path can't execute). Stores provider
 * config and the canonical engine-neutral transcript at `~/.mineco/mineco.db`.
 */

let db: Kysely<Database> | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS provider_profiles (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    engine      TEXT NOT NULL,
    model       TEXT NOT NULL,
    api_key     TEXT NOT NULL DEFAULT '',
    base_url    TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    cwd         TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS turns (
    id               TEXT PRIMARY KEY,
    session_id       TEXT NOT NULL,
    profile_id       TEXT NOT NULL,
    engine           TEXT NOT NULL,
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
    engine      TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
`;

/** Opens (once) and returns the shared Kysely database, creating tables on
 * first use. */
export function getDb(): Kysely<Database> {
  if (db) return db;
  const dir = path.join(os.homedir(), ".mineco");
  fs.mkdirSync(dir, { recursive: true });
  const sqlite = new DatabaseSync(path.join(dir, "mineco.db"));
  sqlite.exec(SCHEMA);
  db = new Kysely<Database>({
    dialect: new NodeSqliteDialect(sqlite),
    plugins: [new CamelCasePlugin()],
  });
  return db;
}
