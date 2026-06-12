/**
 * SessionManager — owns all live SessionRunners, keyed by sessionId (§2.1, §7).
 *
 * Resolves the profile, persists session metadata, and bridges SDK events
 * (via the RunnerSink) to notifications + DB. Live runners are in-memory; the
 * durable transcript stays in the SDK's native JSONL (resume source of truth,
 * §3) with a projection cache in `messages` for UI history.
 */
import {
  ErrorCode,
  type PermissionBehavior,
  type PermissionMode,
  type Profile,
  type SdkMessage,
} from '@/protocol';
import { type Repositories } from '../db/repositories.ts';
import { type RunnerSink, SessionRunner } from './runner.ts';

export interface CreateOptions {
  cwd: string;
  profileId?: string | null;
  title?: string | null;
}

export interface CreatedSession {
  sessionId: string;
  init: SdkMessage;
}

export class SessionManager {
  private runners = new Map<string, SessionRunner>();

  constructor(
    private readonly sink: RunnerSink,
    private readonly repos: Repositories,
  ) {}

  has(id: string): boolean {
    return this.runners.has(id);
  }

  get(id: string): SessionRunner {
    const r = this.runners.get(id);
    if (!r) throw new SessionError(ErrorCode.SessionNotFound, `session not found: ${id}`);
    return r;
  }

  /** Create + initialize a new runner against the resolved profile. */
  async create(opts: CreateOptions): Promise<CreatedSession> {
    const profile = opts.profileId
      ? this.repos.profiles.get(opts.profileId)
      : this.repos.profiles.getActive();
    if (!profile) {
      throw new SessionError(
        ErrorCode.ProfileNotFound,
        'no profile available — create one via config/saveProfile first',
      );
    }

    const sessionId = crypto.randomUUID();
    this.repos.sessions.recordCreate({
      id: sessionId,
      cwd: opts.cwd,
      profileId: profile.id,
      title: opts.title ?? null,
    });

    const runner = new SessionRunner({
      sessionId,
      cwd: opts.cwd,
      profile,
      sink: this.sink,
    });
    this.runners.set(sessionId, runner);
    const init = await runner.initialize();
    return { sessionId, init };
  }

  /** Resume a previously-persisted session. TODO(step 7): real SDK resume. */
  // deno-lint-ignore require-await
  async resume(sessionId: string): Promise<CreatedSession | null> {
    // v1: only an already-live runner can be "resumed" within a process.
    if (this.runners.has(sessionId)) {
      return { sessionId, init: {} };
    }
    return null;
  }

  /** Deliver a user message to a session. */
  send(sessionId: string, text: string): void {
    this.get(sessionId).send(text);
    this.repos.sessions.touch(sessionId);
  }

  /** Interrupt the current turn. */
  async interrupt(sessionId: string): Promise<void> {
    await this.get(sessionId).interrupt();
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    await this.get(sessionId).setModel(model);
  }

  async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<void> {
    await this.get(sessionId).setPermissionMode(mode);
  }

  /** Stage a profile switch (applied on next spawn; TODO step 7 re-spawn). */
  setProfile(sessionId: string, profile: Profile): void {
    this.get(sessionId).setProfile(profile);
  }

  /** Resolve a pending permission request with the user's decision. */
  respondPermission(
    sessionId: string,
    toolUseId: string,
    behavior: PermissionBehavior,
    updatedPermissions?: unknown[],
  ): boolean {
    return this.get(sessionId).respondPermission(toolUseId, behavior, updatedPermissions);
  }

  /** Close + forget a session. */
  async close(sessionId: string): Promise<void> {
    const r = this.runners.get(sessionId);
    if (!r) return;
    await r.close();
    this.repos.sessions.markClosed(sessionId);
    this.runners.delete(sessionId);
  }
}

export class SessionError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.name = 'SessionError';
  }
}
