import { Mutex } from "./mutex.js";

export interface SessionRunState {
  sessionId: string;
  abortController: AbortController;
  startedAt: number;
}

/**
 * Tracks which sessions are currently running an agent loop.
 * Provides per-session mutexes for serializing requests to the same session,
 * and abort controllers for cancelling running agents.
 */
export class SessionRunManager {
  #mutexes = new Map<string, Mutex>();
  #runs = new Map<string, SessionRunState>();

  /** Get or create the mutex for a given session */
  getMutex(sessionId: string): Mutex {
    let mutex = this.#mutexes.get(sessionId);
    if (!mutex) {
      mutex = new Mutex();
      this.#mutexes.set(sessionId, mutex);
    }
    return mutex;
  }

  /**
   * Register a running session.
   * Returns the abort controller if the session was not already running,
   * or false if it is already running.
   */
  start(sessionId: string): { abortController: AbortController } | false {
    if (this.#runs.has(sessionId)) return false;
    const abortController = new AbortController();
    this.#runs.set(sessionId, {
      sessionId,
      abortController,
      startedAt: Date.now(),
    });
    return { abortController };
  }

  /** Unregister a running session */
  finish(sessionId: string): void {
    this.#runs.delete(sessionId);
  }

  /** Abort a running session by ID. Returns true if the session was running. */
  abort(sessionId: string): boolean {
    const run = this.#runs.get(sessionId);
    if (!run) return false;
    run.abortController.abort();
    return true;
  }

  /** Check if a session is currently running */
  isRunning(sessionId: string): boolean {
    return this.#runs.has(sessionId);
  }

  /** Get all currently running session IDs */
  runningSessionIds(): string[] {
    return [...this.#runs.keys()];
  }

  /** Get run state for a session */
  getRun(sessionId: string): SessionRunState | undefined {
    return this.#runs.get(sessionId);
  }
}
