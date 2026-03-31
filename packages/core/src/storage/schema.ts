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
    tool_calls: string | null;
    tool_call_id: string | null;
    tool_name: string | null;
    is_error: number;
    usage: string | null;
    created_at: number;
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

  await sql`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    tool_call_id TEXT,
    tool_name TEXT,
    is_error INTEGER DEFAULT 0,
    usage TEXT,
    created_at INTEGER NOT NULL
  )`.execute(db);
}
