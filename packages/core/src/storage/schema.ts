import { type Kysely, sql } from "kysely";

export interface Database {
  workspaces: {
    id: string;
    path: string;
    name: string;
    last_opened_at: number;
    created_at: number;
  };
  sessions: {
    id: string;
    title: string;
    workspace_id: string;
    created_at: number;
    updated_at: number;
  };
  messages: {
    id: string;
    session_id: string;
    role: string;
    content: string;
    thinking: string | null;
    tool_calls: string | null;
    tool_call_id: string | null;
    tool_name: string | null;
    is_error: number;
    usage: string | null;
    run_id: string | null;
    created_at: number;
  };
  runs: {
    id: string;
    session_id: string;
    parent_tool_call_id: string;
    agent_type: string;
    status: string;
    summary: string | null;
    created_at: number;
    completed_at: number | null;
  };
  usage_records: {
    id: string;
    provider_id: string;
    model: string;
    session_id: string | null;
    message_id: string | null;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
    created_at: number;
  };
  usage_daily: {
    provider_id: string;
    model: string;
    date: string;
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
  };
}

export async function initializeSchema(db: Kysely<Database>): Promise<void> {
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
}
