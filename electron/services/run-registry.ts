/**
 * Run registry — in-memory tracking of which sessions are currently running
 * (EDD §6.6).
 *
 * Run state is intentionally NOT persisted to mineco.db. On app restart the
 * registry starts empty, meaning no session shows as "running" — even if the
 * previous process was interrupted mid-turn. The canonical transcript in SQLite
 * is the source of truth for history; run state is only for the live UI badge.
 *
 * Architecture:
 *   - `Map<sessionId, Set<requestId>>` tracks all in-flight requests per session.
 *   - A session is "running" if its set is non-empty.
 *   - On every change, registered listeners are called with a snapshot of
 *     currently-running session IDs so `main.ts` can broadcast `runStateChanged`.
 */

/** Callback invoked whenever the run state changes. */
export type RunStateListener = (runningSessionIds: string[]) => void;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** sessionId → set of in-flight requestIds */
const inFlight = new Map<string, Set<string>>();

/** Listeners that are notified on every state change. */
const listeners = new Set<RunStateListener>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function notify(): void {
  const ids = runningSessionIds();
  for (const cb of listeners) {
    try {
      cb(ids);
    } catch {
      // Never let a listener crash the main process.
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Marks a turn request as running for a session.
 * Idempotent: calling twice with the same pair is safe.
 */
export function markRunning(sessionId: string, requestId: string): void {
  let set = inFlight.get(sessionId);
  if (!set) {
    set = new Set();
    inFlight.set(sessionId, set);
  }
  set.add(requestId);
  notify();
}

/**
 * Marks a turn request as no longer in-flight.
 * When the session's request set becomes empty it is removed from the map.
 */
export function markIdle(sessionId: string, requestId: string): void {
  const requests = inFlight.get(sessionId);
  if (!requests) return;
  requests.delete(requestId);
  if (requests.size === 0) inFlight.delete(sessionId);
  notify();
}

/** Returns true when the session has at least one in-flight request. */
export function isRunning(sessionId: string): boolean {
  return (inFlight.get(sessionId)?.size ?? 0) > 0;
}

/** Returns the snapshot of all currently-running session IDs. */
export function runningSessionIds(): string[] {
  return [...inFlight.keys()];
}

/**
 * Registers a listener that is called with the full list of running session IDs
 * on every state change. Returns an unsubscribe function.
 */
export function setListener(cb: RunStateListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
