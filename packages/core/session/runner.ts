// SPDX-License-Identifier: Apache-2.0
//
// SessionRunner — drives one SDK `query()` for one session (§3, §7).
//
// State machine (§7): create → initialize (spawn child) → idle →
// (send enqueues a user turn → child runs → stream `assistant`/`result` →
//  sink → idle) → close.
//
// The runner owns exactly one `query()` call whose `prompt` is fed by an
// `AsyncQueue` (streaming input). Messages streamed back from the child are
// drained in a background loop and forwarded to the `RunnerSink`. Tool-use
// permission requests from the child are bridged through the per-session
// `PermissionGate`: `canUseTool` parks a promise, the UI resolves it via
// `respondPermission`.
import { type Options, type PermissionResult, query } from '@anthropic-ai/claude-agent-sdk';
import { type PermissionBehavior, type Profile, type SdkMessage } from '@/protocol';
import { pathToClaudeCodeExecutable, profileEnv } from '../config.ts';
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
  /** Injectable for tests; defaults to the real SDK `query`. */
  createQuery?: typeof query;
}

/**
 * One SDK-driven session.
 *
 * Public lifecycle: `initialize()` → `send()`/`interrupt()`/`setModel()`/
 * `setPermissionMode()`/`setProfile()` → `close()`. Permission requests from
 * the child are answered through `respondPermission()`.
 */
export class SessionRunner {
  readonly sessionId: string;
  readonly cwd: string;
  readonly permissions = new PermissionGate();

  state: RunnerState = 'initializing';
  /** Pending profile switch, applied on re-spawn (§7). */
  pendingProfile: Profile | null = null;

  private readonly inputQueue = new AsyncQueue<SdkMessage>();
  private profile: Profile;
  private sink: RunnerSink;
  private readonly createQuery: typeof query;

  /** Live SDK `Query` handle once `initialize()` has run. */
  private query: ReturnType<typeof query> | null = null;
  /** Background drain-loop promise; awaited in `close()`. */
  private loopPromise: Promise<void> = Promise.resolve();
  /** Session id reported by the child SDK (captured from streamed messages). */
  private sdkSessionId: string | null = null;

  constructor(config: RunnerConfig) {
    this.sessionId = config.sessionId;
    this.cwd = config.cwd;
    this.profile = config.profile;
    this.sink = config.sink;
    this.createQuery = config.createQuery ?? query;
  }

  get currentProfile(): Profile {
    return this.pendingProfile ?? this.profile;
  }

  /** Session id reported by the SDK child, once observed. */
  get sdkSessionIdValue(): string | null {
    return this.sdkSessionId;
  }

  /**
   * Spawn the child and start draining its message stream. Returns an empty
   * init payload (the real session id arrives asynchronously in streamed
   * messages and is exposed via `sdkSessionIdValue`).
   */
  initialize(): Promise<SdkMessage> {
    const options: Options = {
      executable: 'deno',
      cwd: this.cwd,
      env: profileEnv(this.profile),
      settingSources: [],
      pathToClaudeCodeExecutable: pathToClaudeCodeExecutable(),
      permissionMode: this.profile.permission_mode,
      canUseTool: (...args) => this.handleCanUseTool(...args),
    };
    if (this.profile.default_model) {
      options.model = this.profile.default_model;
    }

    this.query = this.createQuery({
      // SDKUserMessage requires a server-assigned session_id; we push before
      // one is known, so erase the queue's element type at the call site
      // (structurally compatible at runtime).
      // deno-lint-ignore no-explicit-any
      prompt: this.inputQueue as AsyncIterable<any>,
      options,
    });
    this.loopPromise = this.drain();
    this.state = 'idle';
    return Promise.resolve({});
  }

  /** Background loop: forward every streamed SDK message to the sink. */
  private async drain(): Promise<void> {
    if (!this.query) return;
    try {
      for await (const msg of this.query) {
        if (this.state === 'closed') break;
        const m = msg as Record<string, unknown>;
        if (typeof m.session_id === 'string') this.sdkSessionId = m.session_id;
        this.sink.onMessage(this.sessionId, m);
        if (m.type === 'result') this.sink.onResult(this.sessionId, m);
      }
    } catch {
      // Swallow; close() owns teardown. A non-close failure just ends the turn.
    }
    if (this.state !== 'closed') {
      this.state = 'idle';
    }
  }

  /** Enqueue a user turn as plain text. No-op once closed. */
  send(text: string): void {
    if (this.state === 'closed') return;
    this.inputQueue.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
    });
    this.state = 'running';
  }

  /** Interrupt the current turn. */
  async interrupt(): Promise<void> {
    await this.query?.interrupt();
  }

  /** Hot-swap the model on the live child (§7). */
  async setModel(model: string): Promise<void> {
    await this.query?.setModel(model);
  }

  /** Hot-swap the permission mode on the live child (§7). */
  async setPermissionMode(mode: Profile['permission_mode']): Promise<void> {
    await this.query?.setPermissionMode(mode);
  }

  /**
   * Schedule a profile switch. A live re-spawn with SDK resume is a later
   * step; for now we just stage the new profile.
   */
  setProfile(profile: Profile): void {
    this.pendingProfile = profile;
    // TODO(step 7): re-spawn with resume: this.sdkSessionId
  }

  /**
   * Resolve a pending permission request. Translates the wire `behavior`
   * into a `PermissionDecision` and hands it to the gate. Returns false if
   * the request was unknown/stale.
   */
  respondPermission(
    toolUseId: string,
    behavior: PermissionBehavior,
    updatedPermissions?: unknown[],
  ): boolean {
    return this.permissions.respond(toolUseId, {
      behavior,
      updatedPermissions,
    });
  }

  /** `canUseTool` bridge: surface the request, then await the UI decision. */
  private async handleCanUseTool(
    toolName: string,
    input: Record<string, unknown>,
    ctx: {
      signal: AbortSignal;
      toolUseID: string;
      suggestions?: unknown[];
    },
  ): Promise<PermissionResult> {
    this.sink.onPermissionRequest(this.sessionId, ctx.toolUseID, toolName, input);
    const d = await this.permissions.request(ctx.toolUseID);
    if (d.behavior === 'deny') {
      return { behavior: 'deny', message: d.message ?? 'Denied by user' };
    }
    const allow: PermissionResult = {
      behavior: 'allow',
      updatedInput: input,
    };
    if (d.behavior === 'allowAlways') {
      allow.updatedPermissions = ctx.suggestions as PermissionUpdateArray;
    }
    return allow;
  }

  /** Close the session: interrupt child, close input, drop permissions. */
  async close(): Promise<void> {
    this.state = 'closed';
    await this.query?.interrupt();
    this.inputQueue.close();
    this.permissions.clear();
    try {
      await this.loopPromise;
    } catch {
      // ignore
    }
  }
}

/** Element type of `PermissionResult.updatedPermissions`. */
type PermissionUpdateArray = NonNullable<
  Exclude<PermissionResult, { behavior: 'deny' }>['updatedPermissions']
>;
