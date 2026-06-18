/**
 * Live engine-session registry — keeps each mineco session's persistent
 * {@link EngineSession} (one warm native query) in memory across turns.
 *
 * Like the run-registry, this is intentionally NOT persisted: on restart the
 * map starts empty, and the first turn of a reopened session lazily reopens its
 * query (resuming the native thread via the last turn's `nativeThreadId`). A
 * session is bound to ONE agent (its `configDir` is fixed); switching agents
 * tears the old query down and opens a fresh one — handled here by
 * {@link openSession}, which closes any existing entry first.
 *
 * **Idle eviction.** A warm query holds a native subprocess, so a session that
 * has sat idle (no in-flight turn) longer than {@link IDLE_MS} is closed by a
 * periodic sweep to bound resource use. The next turn reopens it cold via
 * `resume`. A session is never evicted while a turn is in flight ({@link
 * holdSession} / {@link releaseSession} bracket each turn).
 */

import { getEngine } from "@/main/engines/registry";
import type { EngineSession, EngineSessionInit } from "@/main/engines/types";
import type { EngineId } from "@/shared/agent-protocol";

/** Close a session whose last turn ended more than this long ago. */
const IDLE_MS = 15 * 60 * 1000;
/** How often the idle sweep runs. */
const SWEEP_MS = 60 * 1000;

interface Entry {
  session: EngineSession;
  /** Epoch ms of the last turn start/end — the idle clock. */
  lastUsed: number;
  /** True while a turn is in flight (never evict a busy session). */
  busy: boolean;
}

/** sessionId → its live engine session entry. */
const live = new Map<string, Entry>();

let sweepTimer: ReturnType<typeof setInterval> | null = null;

function ensureSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => void sweepIdle(), SWEEP_MS);
  // Don't keep the process alive just for the sweep.
  sweepTimer.unref?.();
}

function stopSweeper(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

/** Closes every session idle longer than {@link IDLE_MS}. */
async function sweepIdle(): Promise<void> {
  const now = Date.now();
  for (const [id, e] of [...live]) {
    if (!e.busy && now - e.lastUsed > IDLE_MS) {
      await closeSession(id);
    }
  }
  if (live.size === 0) stopSweeper();
}

/**
 * Returns the live session for `sessionId` only if it is bound to `agentId`;
 * otherwise null (the caller must (re)open, e.g. on an agent switch or a cold
 * reopen after restart / idle eviction).
 */
export function getMatchingSession(
  sessionId: string,
  agentId: string,
): EngineSession | null {
  const e = live.get(sessionId);
  return e && e.session.agentId === agentId ? e.session : null;
}

/** Returns the live session for `sessionId` regardless of agent, or null. */
export function getLiveSession(sessionId: string): EngineSession | null {
  return live.get(sessionId)?.session ?? null;
}

/** Marks a session busy for the duration of a turn (exempt from idle eviction). */
export function holdSession(sessionId: string): void {
  const e = live.get(sessionId);
  if (e) {
    e.busy = true;
    e.lastUsed = Date.now();
  }
}

/** Marks a session idle again; resets its idle clock. */
export function releaseSession(sessionId: string): void {
  const e = live.get(sessionId);
  if (e) {
    e.busy = false;
    e.lastUsed = Date.now();
  }
}

/**
 * Opens a fresh persistent session for `sessionId`, closing any existing one
 * first (e.g. when the agent changed). Registers and returns it.
 */
export async function openSession(
  sessionId: string,
  engineId: EngineId,
  init: EngineSessionInit,
): Promise<EngineSession> {
  await closeSession(sessionId);
  const session = getEngine(engineId).openSession(init);
  live.set(sessionId, { session, lastUsed: Date.now(), busy: false });
  ensureSweeper();
  return session;
}

/** Closes and unregisters the live session for `sessionId` (no-op if none). */
export async function closeSession(sessionId: string): Promise<void> {
  const e = live.get(sessionId);
  if (!e) return;
  live.delete(sessionId);
  try {
    await e.session.close();
  } catch {
    /* best-effort teardown */
  }
}

/** Closes every live session (app shutdown). */
export async function closeAllSessions(): Promise<void> {
  stopSweeper();
  const ids = [...live.keys()];
  await Promise.all(ids.map((id) => closeSession(id)));
}
