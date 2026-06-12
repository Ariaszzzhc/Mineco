/**
 * JSON-RPC 2.0 codec over newline-delimited UTF-8 frames (§4).
 *
 * Pure framing + (de)serialization + envelope validation. Transport-agnostic:
 * it works against any reader/writer pair. The stdio binding lives in
 * `transport/stdio.ts`.
 */
import {
  ErrorCode,
  JsonRpcMessage,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type RpcId,
} from '@/protocol';

/** A message sink the codec writes outbound frames to. */
export interface MessageWriter {
  write(frame: JsonRpcMessage): void;
}

/** Parse a single line; returns a validated message or a parse error. */
export type DecodeResult =
  | { ok: true; message: JsonRpcMessage }
  | { ok: false; code: ErrorCode; message: string };

export function decode(line: string): DecodeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (err) {
    return { ok: false, code: ErrorCode.ParseError, message: String(err) };
  }
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, code: ErrorCode.ParseError, message: 'frame is not a JSON object' };
  }
  const parsed = JsonRpcMessage.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: ErrorCode.InvalidRequest, message: parsed.error.message };
  }
  return { ok: true, message: parsed.data };
}

export function encode(msg: JsonRpcMessage): string {
  return JSON.stringify(msg);
}

// --- typed constructors for core → client traffic --------------------------

export function responseOk(id: RpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export function responseError(
  id: RpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

export function notify(method: string, params?: unknown): JsonRpcNotification {
  return params === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params };
}

/** Discriminator helper for inbound frames. */
export type InboundRequest = JsonRpcRequest;
