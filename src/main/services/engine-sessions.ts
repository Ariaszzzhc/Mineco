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
import { encodeCwd } from "@/main/services/link";
import type { EngineId } from "@/shared/agent-protocol";

/** Close a session whose last turn ended more than this long ago. */
const IDLE_MS = 15 * 60 * 1000;
/** How often the idle sweep runs. */
const SWEEP_MS = 60 * 1000;

interface Entry {
  session: EngineSession;
  /** The cwd this session's warm subprocess holds open (its native
   * `projects/<encoded-cwd>` dir). Used to gate destructive ops (ADR-0.4-7). */
  cwd: string;
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

/**
 * Live-session predicate for `link.ts`'s migration gate and other destructive
 * ops (ADR-0.4-7). Returns true when some warm session holds a cwd that encodes
 * to the SAME native `projects/<encoded-cwd>` dir as `realCwd`. We compare by
 * encoded dir name (not raw path) because the live map stores the session's raw
 * `cwd` while callers pass `realpath(cwd)`; `encodeCwd` resolves + realpaths
 * both sides, so the comparison is stable regardless of which form was stored.
 *
 * Excluding `sessionId` lets a session's own cold-reopen path migrate its dir
 * (it isn't "live" against itself — the prior warm query was already closed).
 */
export function isCwdLive(realCwd: string, excludeSessionId?: string): boolean {
  const want = encodeCwd(realCwd);
  for (const [id, e] of live) {
    if (id === excludeSessionId) continue;
    if (encodeCwd(e.cwd) === want) return true;
  }
  return false;
}

/**
 * The set of native `projects/<encoded-cwd>` dir names that warm sessions
 * currently hold open. Lets the bootstrap orphan-sweep skip the exact dirs a
 * live subprocess is writing to (ADR-0.4-7) instead of blanket-gating on
 * "any session live". At cold launch this is empty (every dir is an orphan).
 */
export function liveEncodedDirNames(): Set<string> {
  return new Set([...live.values()].map((e) => encodeCwd(e.cwd)));
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
  live.set(sessionId, {
    session,
    cwd: init.cwd,
    lastUsed: Date.now(),
    busy: false,
  });
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
