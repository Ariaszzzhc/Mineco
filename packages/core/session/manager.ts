/**
 * SessionManager — owns all live SessionRunners, keyed by sessionId (§2.1, §7).
 *
 * Provides create/resume/close + lookup + per-session permission dispatch.
 * Persistence of session metadata is delegated to the repository layer.
 */
import { ErrorCode, type Profile, type SdkMessage } from '@/protocol';
import { type RunnerSink, SessionRunner } from './runner.ts';

export class SessionManager {
  private runners = new Map<string, SessionRunner>();

  constructor(private readonly sink: RunnerSink) {}

  has(id: string): boolean {
    return this.runners.has(id);
  }

  get(id: string): SessionRunner {
    const r = this.runners.get(id);
    if (!r) throw new SessionError(ErrorCode.SessionNotFound, `session not found: ${id}`);
    return r;
  }

  /** Create + initialize a new runner. TODO(step 4): persist metadata via repo. */
  async create(opts: {
    sessionId: string;
    cwd: string;
    profile: Profile;
  }): Promise<SessionRunner> {
    const runner = new SessionRunner({
      sessionId: opts.sessionId,
      cwd: opts.cwd,
      profile: opts.profile,
      sink: this.sink,
    });
    this.runners.set(opts.sessionId, runner);
    await runner.initialize();
    return runner;
  }

  /** Resume a previously-persisted session. TODO(step 4): load profile + resume SDK. */
  // deno-lint-ignore require-await
  async resume(sessionId: string): Promise<SessionRunner | null> {
    // For now, only already-live runners can be "resumed" within a process.
    return this.runners.get(sessionId) ?? null;
  }

  /** Deliver a user message to a session. */
  send(sessionId: string, content: SdkMessage): void {
    this.get(sessionId).send(content);
  }

  /** Close + forget a session. TODO(step 4): mark closed in repo. */
  async close(sessionId: string): Promise<void> {
    const r = this.runners.get(sessionId);
    if (!r) return;
    await r.close();
    this.runners.delete(sessionId);
  }
}

export class SessionError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.name = 'SessionError';
  }
}
