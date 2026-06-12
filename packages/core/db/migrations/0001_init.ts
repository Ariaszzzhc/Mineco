// SPDX-License-Identifier: MIT
/**
 * Migration 0001 — initial greenfield schema (§5).
 *
 * Creates the core projection tables stored in `~/.mineco/mineco.db`. All DDL
 * is idempotent (`CREATE TABLE IF NOT EXISTS`). Strings and JSON are `TEXT`;
 * timestamps are `INTEGER` milliseconds; monetary cost is `REAL`.
 *
 * Tables: provider_profiles, app_settings, workspaces, sessions, messages,
 * usage_records. SDK transcripts stay in their native JSONL (§1) — the
 * `messages` table here is a UI projection only.
 */
import type { Migration } from '../migrator.ts';

const migration: Migration = {
  id: 1,
  name: 'init',
  up(db) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS provider_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        api_key TEXT NOT NULL DEFAULT '',
        base_url TEXT NOT NULL DEFAULT '',
        default_model TEXT NOT NULL DEFAULT '',
        permission_mode TEXT NOT NULL DEFAULT 'default',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );`,
    );

    db.exec(
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );`,
    );

    db.exec(
      `CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        last_opened_at INTEGER
      );`,
    );

    db.exec(
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        profile_id TEXT,
        title TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );`,
    );

    db.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );`,
    );
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_session_seq
        ON messages (session_id, seq);`,
    );

    db.exec(
      `CREATE TABLE IF NOT EXISTS usage_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        model TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_creation_tokens INTEGER,
        cache_read_tokens INTEGER,
        cost_usd REAL,
        recorded_at INTEGER NOT NULL
      );`,
    );
  },
};

export default migration;
