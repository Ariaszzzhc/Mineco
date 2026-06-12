import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  type JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponseErr,
  JsonRpcResponseOk,
  NotificationMethod,
  RequestMethod,
} from './schema.ts';

/** Simulate the wire: serialize → parse → validate. */
function roundTrip(msg: JsonRpcMessage): JsonRpcMessage {
  const text = JSON.stringify(msg);
  const parsed: unknown = JSON.parse(text);
  return parsed as JsonRpcMessage;
}

Deno.test('request envelope round-trips', () => {
  const out = roundTrip({
    jsonrpc: '2.0',
    id: 7,
    method: RequestMethod.SessionCreate,
    params: { cwd: '/tmp/proj', title: 'demo' },
  });
  const parsed = JsonRpcRequest.safeParse(out);
  assertEquals(parsed.success, true);
  assertEquals(parsed.data?.method, 'session/create');
});

Deno.test('ok response round-trips', () => {
  const out = roundTrip({
    jsonrpc: '2.0',
    id: 'abc',
    result: { sessionId: 's1', init: {} },
  });
  assertEquals(JsonRpcResponseOk.safeParse(out).success, true);
});

Deno.test('error response round-trips', () => {
  const out = roundTrip({
    jsonrpc: '2.0',
    id: 'abc',
    error: { code: -32001, message: 'session not found' },
  });
  const parsed = JsonRpcResponseErr.safeParse(out).data;
  assertEquals(parsed?.error.code, -32001);
});

Deno.test('notification round-trips and carries no id', () => {
  const out = roundTrip({
    jsonrpc: '2.0',
    method: NotificationMethod.SessionMessage,
    params: { sessionId: 's1', message: {} },
  });
  const parsed = JsonRpcNotification.safeParse(out).data;
  assertEquals(parsed && !('id' in parsed), true);
});

Deno.test('malformed frame is rejected by the schema', async () => {
  // jsonrpc literal mismatch — schema must reject, codec must treat as parse error.
  const bad: unknown = { jsonrpc: '1.0', id: 1, method: 'noop' };
  assertEquals(JsonRpcRequest.safeParse(bad).success, false);
  // sanity: the std assert pipeline throws
  await assertRejects(() => Promise.reject(new Error('marker')));
});
