/**
 * SessionRunner — drives one SDK `query()` for one session (§3, §7).
 *
 * State machine (§7): create → spawn+initialize → idle →
 * (send enqueues → child runs → stream `session/message` → persist →
 *  `result` → idle) → close.
 *
 * Skeleton: lifecycle scaffolding only. SDK wiring (`query()` + streaming-input
 * loop + `canUseTool` bridge) lands in step 4.
 */
import { type Profile, type SdkMessage } from '@/protocol';
import { AsyncQueue } from './async_queue.ts';
import { PermissionGate } from './permission.ts';

export type RunnerState = 'initializing' | 'idle' | 'running' | 'closed';

/** Sink for events the runner emits back toward the client/DB. */
export interface RunnerSink {
  onMessage(sessionId: string, message: SdkMessage): void;
  onResult(sessionId: string, result: SdkMessage): void;
  onPermissionRequest(
    sessionId: string,
    toolUseId: string,
    toolName: string,
    input: unknown,
  ): void;
}

export interface RunnerConfig {
  sessionId: string;
  cwd: string;
  profile: Profile;
  sink: RunnerSink;
}

export class SessionRunner {
  readonly sessionId: string;
  readonly cwd: string;
  readonly permissions = new PermissionGate();

  state: RunnerState = 'initializing';
  /** Pending profile switch, applied at turn end if a turn is running (§7). */
  pendingProfile: Profile | null = null;

  private readonly inputQueue = new AsyncQueue<SdkMessage>();
  private profile: Profile;
  private sink: RunnerSink;
  // private query: Query | null = null; // SDK handle, wired in step 4

  constructor(config: RunnerConfig) {
    this.sessionId = config.sessionId;
    this.cwd = config.cwd;
    this.profile = config.profile;
    this.sink = config.sink;
  }

  get currentProfile(): Profile {
    return this.pendingProfile ?? this.profile;
  }

  /**
   * Spawn the child and drive the SDK `query()` streaming-input loop.
   * TODO(step 4): executable:'deno', CLAUDE_CONFIG_DIR, env from profileEnv(),
   * settingSources:[], pathToClaudeCodeExecutable(), resume on re-spawn.
   */
  // deno-lint-ignore require-await
  async initialize(): Promise<SdkMessage> {
    // const options = { executable: 'deno', settingSources: [], env: profileEnv(this.profile), ... };
    // this.query = query({ prompt: this.inputQueue, options });
    // for await (const msg of this.query) { ... }
    this.state = 'idle';
    return {};
  }

  /** Enqueue a user message (one turn). No-op unless idle. */
  send(content: SdkMessage): void {
    if (this.state === 'closed') return;
    this.inputQueue.push(content);
    this.state = 'running';
  }

  /** SDK hot-swap knobs (§7) — applied to the live child. TODO(step 4). */
  setModel(_model: string): void {
    // this.query?.setModel(model);
  }

  setPermissionMode(_mode: string): void {
    // this.query?.setPermissionMode(mode);
  }

  /** Schedule a profile switch (re-spawn child via SDK resume). §7. */
  setProfile(profile: Profile): void {
    if (this.state === 'idle') {
      this.applyProfile(profile);
    } else {
      // Running: apply at turn end.
      this.pendingProfile = profile;
    }
  }

  /** Interrupt the current turn. TODO(step 4). */
  interrupt(): void {
    // this.query?.interrupt();
  }

  /** Close the session: interrupt child, close input queue, drop permissions. */
  // deno-lint-ignore require-await
  async close(): Promise<void> {
    this.state = 'closed';
    this.inputQueue.close();
    this.permissions.clear();
    // await this.query?.close();
  }

  // --- internals -----------------------------------------------------------

  /** Re-spawn the child under a new profile, resuming the same session id. */
  private applyProfile(profile: Profile): void {
    // q.close(); query({ resume: this.sessionId, options: newProfileEnv });
    this.profile = profile;
    this.pendingProfile = null;
  }
}
