// SPDX-License-Identifier: MIT
/**
 * Raw-SQL repositories over the greenfield schema (§5).
 *
 * One class per table, each bound to a single `Db` handle. No query builder —
 * these are thin, positional-`?` prepared statements against `node:sqlite`.
 * Writes are serialized by the single-process, single-connection model (§5).
 */
import type { Db } from './kysely.ts';
import type { PermissionMode, Profile, ProviderKind, SdkMessage } from '@/protocol';

/** UI projection of a session row (SDK transcript stays in JSONL, §1). */
export interface SessionMeta {
  id: string;
  cwd: string;
  profileId: string | null;
  title: string | null;
  status: 'open' | 'closed';
  createdAt: number;
  updatedAt: number;
}

/** Row shape for `provider_profiles`. */
interface ProfileRow {
  id: string;
  name: string;
  provider: string;
  api_key: string;
  base_url: string;
  default_model: string;
  permission_mode: string;
  created_at: number;
  updated_at: number;
}

/** Row shape for `sessions`. */
interface SessionRow {
  id: string;
  cwd: string;
  profile_id: string | null;
  title: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

/** Row shape for `messages`. */
interface MessageRow {
  id: number;
  session_id: string;
  seq: number;
  payload: string;
  created_at: number;
}

/**
 * `provider_profiles` access — connection configs incl. plaintext api_key (§5).
 */
export class ProfileRepository {
  constructor(private readonly db: Db) {}

  private mapRow(row: ProfileRow): Profile {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider as ProviderKind,
      api_key: row.api_key,
      base_url: row.base_url,
      default_model: row.default_model,
      permission_mode: row.permission_mode as PermissionMode,
    };
  }

  /** All profiles ordered by name. */
  list(): Profile[] {
    const rows = this.db
      .prepare('SELECT * FROM provider_profiles ORDER BY name ASC;')
      .all() as unknown as ProfileRow[];
    return rows.map((r) => this.mapRow(r));
  }

  /** Single profile by id, or null. */
  get(id: string): Profile | null {
    const row = this.getRow(id);
    return row ? this.mapRow(row) : null;
  }

  /** Raw row fetch (used to preserve `created_at` on update). */
  private getRow(id: string): ProfileRow | null {
    const row = this.db
      .prepare('SELECT * FROM provider_profiles WHERE id = ?;')
      .get(id) as unknown as ProfileRow | undefined;
    return row ?? null;
  }

  /**
   * Upsert by id. Empty `input.id` → a new UUID is generated. On update,
   * `created_at` is preserved and `updated_at` is bumped. Returns the stored
   * profile (re-read).
   */
  save(input: Profile): Profile {
    const id = input.id || crypto.randomUUID();
    const now = Date.now();
    const existing = this.getRow(id);
    const createdAt = existing ? existing.created_at : now;

    this.db
      .prepare(
        `INSERT INTO provider_profiles
          (id, name, provider, api_key, base_url, default_model, permission_mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           provider = excluded.provider,
           api_key = excluded.api_key,
           base_url = excluded.base_url,
           default_model = excluded.default_model,
           permission_mode = excluded.permission_mode,
           updated_at = excluded.updated_at;`,
      )
      .run(
        id,
        input.name,
        input.provider,
        input.api_key,
        input.base_url,
        input.default_model,
        input.permission_mode,
        createdAt,
        now,
      );

    const stored = this.get(id);
    // INSERT ... RETURNING would be cleaner, but re-read keeps it simple.
    if (!stored) throw new Error(`profile save failed for id=${id}`);
    return stored;
  }

  /** Delete a profile by id. No-op if absent. */
  remove(id: string): void {
    this.db.prepare('DELETE FROM provider_profiles WHERE id = ?;').run(id);
  }

  /** Set the active profile (KV `active_profile_id` in app_settings). */
  setActive(id: string): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value) VALUES ('active_profile_id', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      )
      .run(id);
  }

  /**
   * The active profile, or — if no explicit setting exists — the first profile
   * by `created_at` (so a default always exists once any profile does). Null
   * only when there are zero profiles.
   */
  getActive(): Profile | null {
    const setting = this.db
      .prepare("SELECT value FROM app_settings WHERE key = 'active_profile_id';")
      .get() as unknown as { value: string } | undefined;
    if (setting) {
      const p = this.get(setting.value);
      if (p) return p;
    }
    const row = this.db
      .prepare('SELECT * FROM provider_profiles ORDER BY created_at ASC LIMIT 1;')
      .get() as unknown as ProfileRow | undefined;
    return row ? this.mapRow(row) : null;
  }
}

/**
 * `sessions` access — UI projection of SDK session lifecycle (§5).
 */
export class SessionRepository {
  constructor(private readonly db: Db) {}

  /** Record a freshly created session (status 'open', timestamps now). */
  recordCreate(opts: {
    id: string;
    cwd: string;
    profileId: string | null;
    title: string | null;
  }): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO sessions (id, cwd, profile_id, title, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'open', ?, ?);`,
      )
      .run(opts.id, opts.cwd, opts.profileId, opts.title, now, now);
  }

  /** All sessions, newest update first. */
  list(): SessionMeta[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY updated_at DESC;')
      .all() as unknown as SessionRow[];
    return rows.map((r) => this.mapRow(r));
  }

  /** Single session by id, or null. */
  get(id: string): SessionMeta | null {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?;')
      .get(id) as unknown as SessionRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  /** Bump `updated_at` to now. */
  touch(id: string): void {
    this.db
      .prepare('UPDATE sessions SET updated_at = ? WHERE id = ?;')
      .run(Date.now(), id);
  }

  /** Mark a session closed and bump `updated_at`. */
  markClosed(id: string): void {
    this.db
      .prepare(
        `UPDATE sessions SET status = 'closed', updated_at = ? WHERE id = ?;`,
      )
      .run(Date.now(), id);
  }

  private mapRow(row: SessionRow): SessionMeta {
    return {
      id: row.id,
      cwd: row.cwd,
      profileId: row.profile_id,
      title: row.title,
      status: row.status === 'closed' ? 'closed' : 'open',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * `messages` access — ordered UI projection of an SDK message stream. Each
 * message is assigned a per-session monotonic `seq`; the payload is stored as
 * JSON text.
 */
export class MessageRepository {
  constructor(private readonly db: Db) {}

  /** Append a message, assigning the next seq for its session. */
  append(opts: { sessionId: string; payload: SdkMessage }): void {
    const max = this.db
      .prepare('SELECT MAX(seq) AS max_seq FROM messages WHERE session_id = ?;')
      .get(opts.sessionId) as unknown as { max_seq: number | null } | undefined;
    const nextSeq = (max?.max_seq ?? 0) + 1;
    this.db
      .prepare(
        `INSERT INTO messages (session_id, seq, payload, created_at)
         VALUES (?, ?, ?, ?);`,
      )
      .run(opts.sessionId, nextSeq, JSON.stringify(opts.payload), Date.now());
  }

  /** All messages for a session in seq order, parsed back to SdkMessage. */
  list(sessionId: string): SdkMessage[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM messages WHERE session_id = ? ORDER BY seq ASC;',
      )
      .all(sessionId) as unknown as MessageRow[];
    return rows.map((r) => JSON.parse(r.payload) as SdkMessage);
  }
}

/** Expected usage shape on an SDK message (best-effort, may be absent). */
interface SdkUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * `usage_records` access — minimal v1. Best-effort: reads usage/cost off the
 * SDK message if present and never throws on missing fields.
 */
export class UsageRepository {
  constructor(private readonly db: Db) {}

  /**
   * Record usage from an SDK message if it carries a `usage` block and/or
   * `total_cost_usd`. Missing fields are stored as NULL.
   */
  record(opts: { sessionId: string; message: SdkMessage }): void {
    const usage = opts.message.usage as SdkUsage | undefined;
    if (!usage) return; // nothing to record
    const model = typeof opts.message.model === 'string' ? (opts.message.model as string) : null;
    const costUsd = typeof opts.message.total_cost_usd === 'number'
      ? (opts.message.total_cost_usd as number)
      : null;
    this.db
      .prepare(
        `INSERT INTO usage_records
          (session_id, model, input_tokens, output_tokens,
           cache_creation_tokens, cache_read_tokens, cost_usd, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      )
      .run(
        opts.sessionId,
        model,
        usage.input_tokens ?? null,
        usage.output_tokens ?? null,
        usage.cache_creation_input_tokens ?? null,
        usage.cache_read_input_tokens ?? null,
        costUsd,
        Date.now(),
      );
  }

  /** Aggregate view — TODO(step 3+). Returns [] for now. */
  aggregate(): unknown[] {
    return [];
  }
}

/** Bundle of all repositories bound to one `Db` handle. */
export interface Repositories {
  profiles: ProfileRepository;
  sessions: SessionRepository;
  messages: MessageRepository;
  usage: UsageRepository;
}

/** Construct the four repositories over a shared `Db` handle. */
export function createRepositories(db: Db): Repositories {
  return {
    profiles: new ProfileRepository(db),
    sessions: new SessionRepository(db),
    messages: new MessageRepository(db),
    usage: new UsageRepository(db),
  };
}
