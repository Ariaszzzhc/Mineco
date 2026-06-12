/**
 * JSON-RPC method router (§4.1, §4.2).
 *
 * Maps inbound client Requests to handlers and exposes the core → client
 * notification sink. Skeleton: wires the shape; full handlers land step 3–4.
 */
import {
  ErrorCode,
  type JsonRpcMessage,
  type JsonRpcRequest,
  RequestMethod,
  type RpcId,
} from '@/protocol';
import { type MessageWriter, responseError, responseOk } from './transport/jsonrpc.ts';
import { SessionError, SessionManager } from './session/manager.ts';
import type { RunnerSink } from './session/runner.ts';

export interface ServerDeps {
  /** Outbound channel (notifications + responses) to the client. */
  send: MessageWriter;
  managers: {
    sessions: SessionManager;
  };
}

/**
 * Build a RunnerSink that bridges SDK events to outbound notifications + DB.
 * Returns the sink used by every SessionRunner.
 */
export function makeRunnerSink(send: MessageWriter): RunnerSink {
  return {
    onMessage(sessionId, message) {
      send.write({ jsonrpc: '2.0', method: 'session/message', params: { sessionId, message } });
    },
    onResult(sessionId, result) {
      // result carries usage + total_cost_usd → usage_records (§3, §5.6). TODO step 4.
      send.write({
        jsonrpc: '2.0',
        method: 'session/message',
        params: { sessionId, message: result },
      });
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
      const code = err instanceof SessionError ? err.code : ErrorCode.InternalError;
      send.write(responseError(req.id, code, err instanceof Error ? err.message : String(err)));
    }
  }

  /**
   * Method dispatch. TODO(step 3–4): flesh out each handler.
   * Returns `null` for void RPCs.
   */
  private async handle(req: JsonRpcRequest): Promise<unknown> {
    const sessions = this.deps.managers.sessions;
    switch (req.method) {
      case RequestMethod.SessionList:
        return []; // TODO: sessions.list()
      case RequestMethod.SessionCreate: {
        const p = req.params as { cwd: string; profileId?: string; title?: string } | undefined;
        if (!p?.cwd) throw new SessionError(ErrorCode.InvalidParams, 'cwd required');
        // TODO: resolve profile via repository; until then a placeholder profile.
        return { sessionId: 'TODO', init: {} };
      }
      case RequestMethod.SessionClose: {
        const p = req.params as { sessionId: string } | undefined;
        if (p?.sessionId) await sessions.close(p.sessionId);
        return null;
      }
      case RequestMethod.ConfigListProfiles:
        return []; // TODO: profiles.list()
      case RequestMethod.UsageGet:
        return []; // TODO: usage.aggregate(range, groupBy)
      default:
        throw new SessionError(ErrorCode.MethodNotFound, `method not found: ${req.method}`);
    }
  }
}

/** Helper: emit a diagnostic `ready` notification (§8 — optional). */
export function emitReady(send: MessageWriter, pid: number, version: string, _id?: RpcId): void {
  send.write({ jsonrpc: '2.0', method: 'ready', params: { pid, version } });
}
