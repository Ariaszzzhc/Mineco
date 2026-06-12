/**
 * Migrator — applies greenfield schema migrations (§5).
 *
 * Skeleton: defines the migration runner contract and a place for migrations
 * to register. Concrete DDL (workspaces / sessions / messages / usage_records
 * / provider_profiles) lands in step 3 via db/migrations/.
 */
import type { Db } from './kysely.ts';

export interface Migration {
  id: number;
  name: string;
  up: (db: Db) => void;
}

/** Ensure the schema_migrations bookkeeping table exists. */
export function ensureMigrationsTable(db: Db): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
  );
}

export function appliedMigrations(db: Db): Set<number> {
  const rows = db.prepare('SELECT id FROM schema_migrations;').all() as Array<{ id: number }>;
  return new Set(rows.map((r) => r.id));
}

/**
 * Apply pending migrations in order, each in its own transaction.
 * TODO(step 3): wire real migration list.
 */
export function migrate(db: Db, migrations: Migration[]): void {
  ensureMigrationsTable(db);
  const applied = appliedMigrations(db);
  const pending = [...migrations].sort((a, b) => a.id - b.id).filter((m) => !applied.has(m.id));
  for (const m of pending) {
    db.exec('BEGIN;');
    try {
      m.up(db);
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?);').run(m.id);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
}
