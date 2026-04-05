import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    last_opened_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`.execute(db);

  await sql`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Session',
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`.execute(db);

  await sql`CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_tool_call_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    summary TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  )`.execute(db);

  await sql`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    thinking TEXT,
    tool_calls TEXT,
    tool_call_id TEXT,
    tool_name TEXT,
    is_error INTEGER DEFAULT 0,
    usage TEXT,
    run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  )`.execute(db);

  await sql`CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    model TEXT NOT NULL,
    session_id TEXT,
    message_id TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`.execute(db);

  await sql`CREATE TABLE IF NOT EXISTS usage_daily (
    provider_id TEXT NOT NULL,
    model TEXT NOT NULL,
    date TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (provider_id, model, date)
  )`.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS idx_usage_records_session ON usage_records(session_id)`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at)`.execute(
    db,
  );

  await sql`CREATE TABLE IF NOT EXISTS session_notes (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    note_type TEXT NOT NULL DEFAULT 'auto-extracted',
    token_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS idx_session_notes_session ON session_notes(session_id)`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_session_notes_session`.execute(db);
  await sql`DROP TABLE IF EXISTS session_notes`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_usage_records_created_at`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_usage_records_session`.execute(db);
  await sql`DROP TABLE IF EXISTS usage_daily`.execute(db);
  await sql`DROP TABLE IF EXISTS usage_records`.execute(db);
  await sql`DROP TABLE IF EXISTS messages`.execute(db);
  await sql`DROP TABLE IF EXISTS runs`.execute(db);
  await sql`DROP TABLE IF EXISTS sessions`.execute(db);
  await sql`DROP TABLE IF EXISTS workspaces`.execute(db);
}
