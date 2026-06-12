/**
 * Mineco JSON-RPC 2.0 protocol (stdio, newline-delimited).
 *
 * Single source of truth for the contract between the SwiftUI thin client and
 * the Deno core process. See docs/technical-design.md §4.
 *
 * Transport model (§4):
 * - Request     (client → core)  : has `id`, expects a Response.
 * - Response    (core → client)  : echoes the Request `id`; either `{result}`
 *                                  or `{error}`.
 * - Notification (bidirectional)  : no `id`, fire-and-forget.
 *
 * Only the client issues Requests; core only issues Notifications.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Generic JSON-RPC 2.0 envelope
// ---------------------------------------------------------------------------

/** `id` is a string or integer; notifications omit it entirely. */
export const RpcId = z.union([z.string(), z.number().int()]);

export const JsonRpcRequest = z.object({
  jsonrpc: z.literal('2.0'),
  id: RpcId,
  method: z.string(),
  params: z.unknown().optional(),
});

export const JsonRpcResponseOk = z.object({
  jsonrpc: z.literal('2.0'),
  id: RpcId,
  result: z.unknown(),
});

export const JsonRpcError = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const JsonRpcResponseErr = z.object({
  jsonrpc: z.literal('2.0'),
  id: RpcId,
  error: JsonRpcError,
});

export const JsonRpcNotification = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.unknown().optional(),
});

export type RpcId = z.infer<typeof RpcId>;
export type JsonRpcRequest = z.infer<typeof JsonRpcRequest>;
export type JsonRpcResponseOk = z.infer<typeof JsonRpcResponseOk>;
export type JsonRpcError = z.infer<typeof JsonRpcError>;
export type JsonRpcResponseErr = z.infer<typeof JsonRpcResponseErr>;
export type JsonRpcResponse = JsonRpcResponseOk | JsonRpcResponseErr;
export type JsonRpcNotification = z.infer<typeof JsonRpcNotification>;
/** Any frame on the wire. */
export const JsonRpcMessage = z.union([
  JsonRpcRequest,
  JsonRpcResponseOk,
  JsonRpcResponseErr,
  JsonRpcNotification,
]);
export type JsonRpcMessage = z.infer<typeof JsonRpcMessage>;

// ---------------------------------------------------------------------------
// Standard error codes
// ---------------------------------------------------------------------------

/** JSON-RPC 2.0 standard error code range: [-32768, -32000]. */
export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  /** Mineco-specific application errors start at the top of the impl range. */
  SessionNotFound: -32001,
  SessionNotIdle: -32002,
  ProfileNotFound: -32003,
  PermissionTimeout: -32004,
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ---------------------------------------------------------------------------
// Method names (§4.1 requests, §4.2 notifications)
// ---------------------------------------------------------------------------

/** Request methods issued by the client (core → client Response). */
export const RequestMethod = {
  // config
  ConfigListProfiles: 'config/listProfiles',
  ConfigSaveProfile: 'config/saveProfile',
  ConfigDeleteProfile: 'config/deleteProfile',
  ConfigSetActiveProfile: 'config/setActiveProfile',
  // usage
  UsageGet: 'usage/get',
  // session lifecycle
  SessionList: 'session/list',
  SessionCreate: 'session/create',
  SessionResume: 'session/resume',
  SessionSend: 'session/send',
  SessionInterrupt: 'session/interrupt',
  SessionClose: 'session/close',
  SessionMessages: 'session/messages',
  // session runtime knobs
  SessionSetModel: 'session/setModel',
  SessionSetPermissionMode: 'session/setPermissionMode',
  SessionSetMcpServers: 'session/setMcpServers',
  SessionApplyFlagSettings: 'session/applyFlagSettings',
  SessionSetProfile: 'session/setProfile',
  // permission round-trip
  SessionRespondPermission: 'session/respondPermission',
} as const;

export type RequestMethod = (typeof RequestMethod)[keyof typeof RequestMethod];

/** Notification methods. Most originate from core (§4.2). */
export const NotificationMethod = {
  SessionMessage: 'session/message',
  SessionPermissionRequest: 'session/permissionRequest',
  Ready: 'ready',
  Stderr: 'stderr',
  Error: 'error',
} as const;

export type NotificationMethod = (typeof NotificationMethod)[keyof typeof NotificationMethod];

// ---------------------------------------------------------------------------
// Common domain primitives shared across params/results
// ---------------------------------------------------------------------------

/** SDK message payload is opaque to the transport layer; core forwards it. */
export type SdkMessage = Record<string, unknown>;

/** Permission behavior returned by the user in `session/respondPermission`. */
export const PermissionBehavior = z.enum([
  'allow',
  'allowAlways',
  'deny',
]);
export type PermissionBehavior = z.infer<typeof PermissionBehavior>;

/** Profile provider kinds (§6). v1 ships `anthropic` and `custom`. */
export const ProviderKind = z.enum(['anthropic', 'custom']);
export type ProviderKind = z.infer<typeof ProviderKind>;

/** Coarse permission modes forwarded to the SDK (§5.5). */
export const PermissionMode = z.enum([
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
]);
export type PermissionMode = z.infer<typeof PermissionMode>;

/**
 * A connection profile (§5.4 / §6). Stored in `provider_profiles`; secrets
 * (api_key) live in plaintext SQLite by design (§1).
 *
 * Wire shape only — persistence mapping lives in core. Fields after
 * `default_model` are TODO and will be tightened in step 2.
 */
export const Profile = z.object({
  id: z.string(),
  name: z.string(),
  provider: ProviderKind,
  api_key: z.string().default(''),
  base_url: z.string().default(''),
  default_model: z.string().default(''),
  permission_mode: PermissionMode.default('default'),
  // allowed_tools / mcp_servers / is_active: TODO(step 2)
});
export type Profile = z.infer<typeof Profile>;

// ---------------------------------------------------------------------------
// Typed request/notification descriptors
//
// These are placeholders establishing the shape; full params/results schemas
// arrive in step 2. They are declared so the router (core/server.ts) can be
// typed end-to-end from day one.
// ---------------------------------------------------------------------------

export interface SessionCreateParams {
  cwd: string;
  profileId?: string;
  title?: string;
}

export interface SessionCreateResult {
  sessionId: string;
  /** `query.initializationResult()` from the SDK. */
  init: SdkMessage;
}

export interface SessionMessageNotification {
  sessionId: string;
  message: SdkMessage;
}

export interface PermissionRequestNotification {
  sessionId: string;
  /** Business id: the SDK toolUseID. */
  requestId: string;
  toolName: string;
  input: unknown;
}
