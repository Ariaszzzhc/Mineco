/**
 * Kysely instance over `node:sqlite` (§1, §5).
 *
 * Single process, single connection, WAL mode, serialized writes. DB lives at
 * `~/.mineco/mineco.db` and holds UI/stat/config projections only — SDK
 * transcripts stay in their native JSONL (§1, §5).
 *
 * Skeleton: opens a connection + applies WAL. Schema/migrations land in step 3.
 */
import { dirname } from 'jsr:@std/path@1';
import { dbPath, minecoHome } from '../config.ts';

// `node:sqlite` is a Node-compatible built-in; in Deno it requires --unstable.
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

/** Open the single SQLite connection, apply WAL + sane pragmas (§5). */
export function openDb(): Db {
  // `node:sqlite` won't create the parent dir; ensure ~/.mineco exists first.
  Deno.mkdirSync(minecoHome(), { recursive: true });
  // Best-effort: WAL creates -wal/-shm siblings; ensure they're co-located.
  Deno.mkdirSync(dirname(dbPath()), { recursive: true });
  const db = new DatabaseSync(dbPath());
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}
