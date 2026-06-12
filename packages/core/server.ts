/**
 * JSON-RPC method router (§4.1, §4.2).
 *
 * Maps inbound client Requests to handlers and exposes the core → client
 * notification sink. Handlers wire the SessionManager + repositories to real
 * behaviour: profile CRUD, session lifecycle, streaming send, permission
 * round-trip, message history, usage.
 */
import {
  type ErrorCode,
  ErrorCode as ErrorCodeEnum,
  type JsonRpcMessage,
  type JsonRpcRequest,
  type PermissionBehavior,
  type PermissionMode,
  Profile as ProfileSchema,
  RequestMethod,
  type RpcId,
} from '@/protocol';
import { type Repositories } from './db/repositories.ts';
import { type MessageWriter, responseError, responseOk } from './transport/jsonrpc.ts';
import { SessionError, SessionManager } from './session/manager.ts';
import type { RunnerSink } from './session/runner.ts';

export interface ServerDeps {
  /** Outbound channel (notifications + responses) to the client. */
  send: MessageWriter;
  repos: Repositories;
  managers: {
    sessions: SessionManager;
  };
}

/**
 * Build a RunnerSink that bridges SDK events to outbound notifications + DB:
 * every streamed message is appended to the `messages` projection cache and
 * forwarded to the UI; a `result` also records usage. Permission requests are
 * forwarded for the UI round-trip (§4.3).
 */
export function makeRunnerSink(send: MessageWriter, repos: Repositories): RunnerSink {
  return {
    onMessage(sessionId, message) {
      repos.messages.append({ sessionId, payload: message });
      repos.sessions.touch(sessionId);
      send.write({ jsonrpc: '2.0', method: 'session/message', params: { sessionId, message } });
    },
    onResult(sessionId, result) {
      // result carries usage + total_cost_usd → usage_records (§3, §5.6).
      // The message itself is already forwarded via onMessage above.
      try {
        repos.usage.record({ sessionId, message: result });
      } catch {
        // usage recording is best-effort; never block the stream.
      }
    },
    onPermissionRequest(sessionId, toolUseId, toolName, input) {
      send.write({
        jsonrpc: '2.0',
        method: 'session/permissionRequest',
        params: { sessionId, requestId: toolUseId, toolName, input },
      });
    },
  };
}

export class Server {
  constructor(private readonly deps: ServerDeps) {}

  /** Entry point for every validated inbound frame. */
  async onMessage(msg: JsonRpcMessage): Promise<void> {
    // v1: client → core is request-only. Responses (core never sent a request)
    // and client notifications are ignored.
    if ('id' in msg && 'method' in msg) {
      await this.dispatch(msg);
    }
  }

  private async dispatch(req: JsonRpcRequest): Promise<void> {
    const { send } = this.deps;
    try {
      const result = await this.handle(req);
      send.write(responseOk(req.id, result));
    } catch (err) {
      const code: ErrorCode = err instanceof SessionError ? err.code : ErrorCodeEnum.InternalError;
      send.write(responseError(req.id, code, err instanceof Error ? err.message : String(err)));
    }
  }

  /** Method dispatch. Returns `null` for void RPCs. */
  private async handle(req: JsonRpcRequest): Promise<unknown> {
    const { sessions } = this.deps.managers;
    const { profiles, usage } = this.deps.repos;
    const p = (req.params ?? {}) as Record<string, unknown>;

    switch (req.method) {
      // --- config ---
      case RequestMethod.ConfigListProfiles:
        return profiles.list();
      case RequestMethod.ConfigSaveProfile: {
        // Parse through the zod schema so defaults apply and enums are validated
        // (raw JSON leaves omitted fields as `undefined`, which node:sqlite
        // cannot bind).
        const profile = ProfileSchema.safeParse(p.profile ?? p);
        if (!profile.success) {
          throw new SessionError(ErrorCodeEnum.InvalidParams, profile.error.message);
        }
        return profiles.save(profile.data);
      }
      case RequestMethod.ConfigDeleteProfile: {
        const id = p.id as string | undefined;
        if (!id) throw new SessionError(ErrorCodeEnum.InvalidParams, 'id required');
        profiles.remove(id);
        return null;
      }
      case RequestMethod.ConfigSetActiveProfile: {
        const id = p.id as string | undefined;
        if (!id) throw new SessionError(ErrorCodeEnum.InvalidParams, 'id required');
        profiles.setActive(id);
        return null;
      }

      // --- usage ---
      case RequestMethod.UsageGet:
        return usage.aggregate();

      // --- session lifecycle ---
      case RequestMethod.SessionList:
        return this.deps.repos.sessions.list();
      case RequestMethod.SessionCreate: {
        const cwd = p.cwd as string | undefined;
        if (!cwd) throw new SessionError(ErrorCodeEnum.InvalidParams, 'cwd required');
        return sessions.create({
          cwd,
          profileId: (p.profileId as string | undefined) ?? null,
          title: (p.title as string | undefined) ?? null,
        });
      }
      case RequestMethod.SessionResume: {
        const id = p.sessionId as string | undefined;
        if (!id) throw new SessionError(ErrorCodeEnum.InvalidParams, 'sessionId required');
        const resumed = await sessions.resume(id);
        if (!resumed) {
          throw new SessionError(ErrorCodeEnum.SessionNotFound, `session not found: ${id}`);
        }
        return resumed;
      }
      case RequestMethod.SessionSend: {
        const id = p.sessionId as string | undefined;
        const text = p.text as string | undefined;
        if (!id || typeof text !== 'string') {
          throw new SessionError(ErrorCodeEnum.InvalidParams, 'sessionId + text required');
        }
        sessions.send(id, text);
        return null;
      }
      case RequestMethod.SessionInterrupt: {
        const id = p.sessionId as string | undefined;
        if (!id) throw new SessionError(ErrorCodeEnum.InvalidParams, 'sessionId required');
        await sessions.interrupt(id);
        return null;
      }
      case RequestMethod.SessionClose: {
        const id = p.sessionId as string | undefined;
        if (id) await sessions.close(id);
        return null;
      }
      case RequestMethod.SessionMessages: {
        const id = p.sessionId as string | undefined;
        if (!id) throw new SessionError(ErrorCodeEnum.InvalidParams, 'sessionId required');
        return this.deps.repos.messages.list(id);
      }

      // --- session runtime knobs ---
      case RequestMethod.SessionSetModel: {
        const id = p.sessionId as string | undefined;
        const model = p.model as string | undefined;
        if (!id || !model) {
          throw new SessionError(ErrorCodeEnum.InvalidParams, 'sessionId + model required');
        }
        await sessions.setModel(id, model);
        return null;
      }
      case RequestMethod.SessionSetPermissionMode: {
        const id = p.sessionId as string | undefined;
        const mode = p.permissionMode as PermissionMode | undefined;
        if (!id || !mode) {
          throw new SessionError(
            ErrorCodeEnum.InvalidParams,
            'sessionId + permissionMode required',
          );
        }
        await sessions.setPermissionMode(id, mode);
        return null;
      }
      case RequestMethod.SessionSetProfile: {
        const id = p.sessionId as string | undefined;
        const parsed = ProfileSchema.safeParse(p.profile);
        if (!id || !parsed.success) {
          throw new SessionError(ErrorCodeEnum.InvalidParams, 'sessionId + profile required');
        }
        sessions.setProfile(id, parsed.data);
        return null;
      }

      // --- permission round-trip ---
      case RequestMethod.SessionRespondPermission: {
        const id = p.sessionId as string | undefined;
        const requestId = p.requestId as string | undefined;
        const behavior = p.behavior as PermissionBehavior | undefined;
        if (!id || !requestId || !behavior) {
          throw new SessionError(
            ErrorCodeEnum.InvalidParams,
            'sessionId + requestId + behavior required',
          );
        }
        return sessions.respondPermission(id, requestId, behavior);
      }

      default:
        throw new SessionError(ErrorCodeEnum.MethodNotFound, `method not found: ${req.method}`);
    }
  }
}

/** Helper: emit a diagnostic `ready` notification (§8 — optional). */
export function emitReady(send: MessageWriter, pid: number, version: string, _id?: RpcId): void {
  send.write({ jsonrpc: '2.0', method: 'ready', params: { pid, version } });
}
