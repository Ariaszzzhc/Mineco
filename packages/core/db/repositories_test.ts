// SPDX-License-Identifier: MIT
/**
 * Tests for the raw-SQL repositories over a temp SQLite DB.
 *
 * Runs the init migration `up(db)` directly (no migrator bookkeeping), then
 * exercises profile/session/message flows. Each test owns its own temp file,
 * removed in a finally block.
 */
import { DatabaseSync } from 'node:sqlite';
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import initMigration from './migrations/0001_init.ts';
import { createRepositories } from './repositories.ts';
import type { Profile } from '@/protocol';

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: '',
    name: 'default',
    provider: 'anthropic',
    api_key: '',
    base_url: '',
    default_model: '',
    permission_mode: 'default',
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.test('ProfileRepository: empty id is generated on save; round-trips', () => {
  const path = Deno.makeTempFileSync({ suffix: '.db' });
  try {
    const db = new DatabaseSync(path);
    initMigration.up(db);
    const { profiles } = createRepositories(db);

    const saved = profiles.save(baseProfile({ id: '', name: 'alpha' }));
    assertNotEquals(saved.id, '');
    assertEquals(saved.name, 'alpha');
    assertEquals(saved.provider, 'anthropic');

    assertEquals(profiles.list().length, 1);
    assertEquals(profiles.get(saved.id)?.name, 'alpha');
    db.close();
  } finally {
    Deno.removeSync(path);
  }
});

Deno.test('ProfileRepository: save updates an existing profile in place', async () => {
  const path = Deno.makeTempFileSync({ suffix: '.db' });
  try {
    const db = new DatabaseSync(path);
    initMigration.up(db);
    const { profiles } = createRepositories(db);

    const first = profiles.save(baseProfile({ id: '', name: 'beta' }));
    await sleep(5);
    const updated = profiles.save(
      baseProfile({ id: first.id, name: 'beta-renamed', api_key: 'k' }),
    );

    // same id, fields overwritten, list reflects new state
    assertEquals(updated.id, first.id);
    assertEquals(updated.name, 'beta-renamed');
    assertEquals(updated.api_key, 'k');
    assertEquals(profiles.list().length, 1);
    db.close();
  } finally {
    Deno.removeSync(path);
  }
});

Deno.test('ProfileRepository: getActive falls back to first by created_at', async () => {
  const path = Deno.makeTempFileSync({ suffix: '.db' });
  try {
    const db = new DatabaseSync(path);
    initMigration.up(db);
    const { profiles } = createRepositories(db);

    // no profiles → null
    assertEquals(profiles.getActive(), null);

    const a = profiles.save(baseProfile({ id: '', name: 'a' }));
    await sleep(5);
    const b = profiles.save(baseProfile({ id: '', name: 'b' }));

    // fallback returns the earliest-created (a)
    assertEquals(profiles.getActive()?.id, a.id);

    // explicit active overrides fallback
    profiles.setActive(b.id);
    assertEquals(profiles.getActive()?.id, b.id);
    db.close();
  } finally {
    Deno.removeSync(path);
  }
});

Deno.test('ProfileRepository: remove deletes a profile', () => {
  const path = Deno.makeTempFileSync({ suffix: '.db' });
  try {
    const db = new DatabaseSync(path);
    initMigration.up(db);
    const { profiles } = createRepositories(db);

    const p = profiles.save(baseProfile({ id: '', name: 'gamma' }));
    profiles.remove(p.id);
    assertEquals(profiles.get(p.id), null);
    assertEquals(profiles.list().length, 0);
    db.close();
  } finally {
    Deno.removeSync(path);
  }
});

Deno.test('SessionRepository: recordCreate + list + touch + markClosed', () => {
  const path = Deno.makeTempFileSync({ suffix: '.db' });
  try {
    const db = new DatabaseSync(path);
    initMigration.up(db);
    const { sessions } = createRepositories(db);

    sessions.recordCreate({ id: 's1', cwd: '/tmp', profileId: null, title: 't1' });
    sessions.recordCreate({ id: 's2', cwd: '/home', profileId: 'p1', title: null });

    const all = sessions.list();
    assertEquals(all.length, 2);

    const s1 = sessions.get('s1');
    assertEquals(s1?.cwd, '/tmp');
    assertEquals(s1?.profileId, null);
    assertEquals(s1?.title, 't1');
    assertEquals(s1?.status, 'open');

    const beforeTouch = s1!.updatedAt;
    sessions.touch('s1');
    assert(sessions.get('s1')!.updatedAt >= beforeTouch);

    sessions.markClosed('s1');
    assertEquals(sessions.get('s1')?.status, 'closed');

    // after touching s1, it should sort first in list (updated_at DESC)
    assertEquals(sessions.list()[0]?.id, 's1');
    db.close();
  } finally {
    Deno.removeSync(path);
  }
});

Deno.test('MessageRepository: append increments seq and list round-trips JSON', () => {
  const path = Deno.makeTempFileSync({ suffix: '.db' });
  try {
    const db = new DatabaseSync(path);
    initMigration.up(db);
    const { messages } = createRepositories(db);

    const payload1: Record<string, unknown> = { type: 'user', text: 'hello' };
    const payload2: Record<string, unknown> = { type: 'assistant', text: 'hi' };

    messages.append({ sessionId: 'm', payload: payload1 });
    messages.append({ sessionId: 'm', payload: payload2 });

    const got = messages.list('m');
    assertEquals(got.length, 2);
    assertEquals(got[0], payload1);
    assertEquals(got[1], payload2);
    db.close();
  } finally {
    Deno.removeSync(path);
  }
});

Deno.test('UsageRepository: record is best-effort, never throws', () => {
  const path = Deno.makeTempFileSync({ suffix: '.db' });
  try {
    const db = new DatabaseSync(path);
    initMigration.up(db);
    const { usage } = createRepositories(db);

    // message without usage → no throw, no-op
    usage.record({ sessionId: 'u', message: { type: 'x' } });
    assertEquals(usage.aggregate(), []);

    // message with usage → no throw
    usage.record({
      sessionId: 'u',
      message: {
        model: 'claude-x',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 2,
          cache_read_input_tokens: 1,
        },
        total_cost_usd: 0.0123,
      },
    });
    assertEquals(usage.aggregate(), []);
    db.close();
  } finally {
    Deno.removeSync(path);
  }
});
