// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for SessionRunner's SDK wiring (§7). Uses a fake `query` factory
// — no real SDK child, no network — to verify the message drain loop, sink
// forwarding, session-id capture, permission bridge, and lifecycle.
import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionBehavior, Profile, SdkMessage } from '@/protocol';
import { type RunnerConfig, type RunnerSink, SessionRunner } from './runner.ts';

/** Type of the injectable `createQuery` on RunnerConfig. */
type CreateQuery = NonNullable<RunnerConfig['createQuery']>;
/** The SDK `Query` return type. */
type QueryHandle = ReturnType<CreateQuery>;

/** Captured sink events, in order. */
type CapturedEvent =
  | { event: 'message'; sessionId: string; message: SdkMessage }
  | { event: 'result'; sessionId: string; result: SdkMessage }
  | {
    event: 'permissionRequest';
    sessionId: string;
    toolUseId: string;
    toolName: string;
    input: unknown;
  };

function capturingSink(): { sink: RunnerSink; events: CapturedEvent[] } {
  const events: CapturedEvent[] = [];
  const sink: RunnerSink = {
    onMessage: (sessionId, message) => events.push({ event: 'message', sessionId, message }),
    onResult: (sessionId, result) => events.push({ event: 'result', sessionId, result }),
    onPermissionRequest: (sessionId, toolUseId, toolName, input) =>
      events.push({ event: 'permissionRequest', sessionId, toolUseId, toolName, input }),
  };
  return { sink, events };
}

function baseProfile(): Profile {
  return {
    id: 'p1',
    name: 'test',
    provider: 'anthropic',
    api_key: 'sk-test',
    base_url: '',
    default_model: '',
    permission_mode: 'default',
  };
}

/**
 * Build a fake async generator that yields the given messages then blocks
 * until `interrupted` flips. Exposed control methods match the SDK `Query`.
 */
function makeFakeHandle(
  messages: SDKMessage[],
  hooks?: { onFirstAwait?: () => void },
): QueryHandle {
  let interrupted = false;
  const iter = (async function* (): AsyncGenerator<SDKMessage, void> {
    for (const m of messages) yield m;
    hooks?.onFirstAwait?.();
    await new Promise<void>((resolve) => {
      const check = () => {
        if (interrupted) resolve();
        else setTimeout(check, 5);
      };
      check();
    });
  })();

  // deno-lint-ignore no-explicit-any
  const handle: any = {
    [Symbol.asyncIterator]() {
      return iter;
    },
    next: (v: unknown) => iter.next(v),
    return: (v?: unknown) => iter.return(v as void),
    throw: (e?: unknown) => iter.throw(e),
    interrupt() {
      interrupted = true;
      return Promise.resolve();
    },
    setModel(_model?: string) {
      return Promise.resolve();
    },
    setPermissionMode(_mode: string) {
      return Promise.resolve();
    },
  };
  return handle as QueryHandle;
}

/** Build a fake `query` factory that records its Options. */
function makeFakeQueryFactory(messages: SDKMessage[], hooks?: {
  onFirstAwait?: () => void;
  onOptions?: (options: Options | undefined) => void;
}): { createQuery: CreateQuery } {
  const createQuery: CreateQuery = ((params) => {
    hooks?.onOptions?.(params.options);
    return makeFakeHandle(messages, hooks);
  }) as CreateQuery;
  return { createQuery };
}

/** Yield to the event loop so the drain loop can make progress. */
function tick(ms = 0): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.test('SessionRunner drains SDK messages to the sink and captures session_id', async () => {
  let capturedOptions: Options | undefined;
  const { createQuery } = makeFakeQueryFactory(
    [
      {
        type: 'assistant',
        session_id: 'sdk-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
      } as SDKMessage,
      {
        type: 'result',
        session_id: 'sdk-1',
        subtype: 'success',
        total_cost_usd: 0.01,
        usage: { input_tokens: 5, output_tokens: 3 },
      } as unknown as SDKMessage,
    ],
    { onOptions: (o) => (capturedOptions = o) },
  );
  const { sink, events } = capturingSink();
  const runner = new SessionRunner({
    sessionId: 'local-1',
    cwd: '/tmp',
    profile: baseProfile(),
    sink,
    createQuery,
  });

  const init = await runner.initialize();
  assertEquals(init, {});
  assertEquals(runner.state, 'idle');
  // Executable/env/permission wiring passed through to the SDK.
  assertEquals(capturedOptions?.executable, 'deno');
  assertEquals(capturedOptions?.settingSources, []);
  assertEquals(capturedOptions?.permissionMode, 'default');
  // canUseTool bridged through.
  assertEquals(typeof capturedOptions?.canUseTool, 'function');

  runner.send('hello');
  assertEquals(runner.state, 'running');

  // Let the drain loop pump the two queued messages.
  await tick(20);

  // sdkSessionId captured from the streamed messages.
  assertEquals(runner.sdkSessionIdValue, 'sdk-1');

  const messages = events.filter((e) => e.event === 'message');
  assertNotEquals(messages.length, 0, 'expected at least one onMessage');
  assertEquals(messages[0]!.message['type'], 'assistant');
  assertEquals(messages[0]!.message['session_id'], 'sdk-1');

  const results = events.filter((e) => e.event === 'result');
  assertEquals(results.length, 1, 'expected exactly one onResult');
  assertEquals(results[0]!.result['type'], 'result');
  assertEquals((results[0]!.result as { subtype?: string }).subtype, 'success');

  await runner.close();
  assertEquals(runner.state, 'closed');
});

Deno.test('SessionRunner close awaits and resolves the drain loop', async () => {
  const { createQuery } = makeFakeQueryFactory([
    {
      type: 'assistant',
      session_id: 'sdk-2',
      message: { role: 'assistant', content: [] },
    } as SDKMessage,
  ]);
  const { sink } = capturingSink();
  const runner = new SessionRunner({
    sessionId: 'local-2',
    cwd: '/tmp',
    profile: baseProfile(),
    sink,
    createQuery,
  });

  await runner.initialize();
  runner.send('go');
  await tick(10);

  // close() must return — it awaits loopPromise, which completes after interrupt.
  await runner.close();
  assertEquals(runner.state, 'closed');
});

Deno.test('respondPermission: deny path resolves the canUseTool bridge', async () => {
  let capturedOptions: Options | undefined;
  const { createQuery } = makeFakeQueryFactory([], {
    onOptions: (o) => (capturedOptions = o),
  });
  const { sink, events } = capturingSink();
  const runner = new SessionRunner({
    sessionId: 'local-3',
    cwd: '/tmp',
    profile: baseProfile(),
    sink,
    createQuery,
  });

  await runner.initialize();
  runner.send('use a tool');

  const canUseTool = capturedOptions?.canUseTool;
  if (!canUseTool) throw new Error('canUseTool not wired into Options');

  // Invoke canUseTool the way the SDK child would, then resolve via the runner.
  const ctx = {
    signal: new AbortController().signal,
    toolUseID: 'tu-1',
    suggestions: [],
  };
  const decisionPromise = canUseTool('Bash', { command: 'rm -rf /' }, ctx);

  // Wait for the runner to have emitted the permission request.
  await tick(15);
  const reqs = events.filter((e) => e.event === 'permissionRequest');
  assertEquals(reqs.length, 1);
  assertEquals(reqs[0]!.toolUseId, 'tu-1');
  assertEquals(reqs[0]!.toolName, 'Bash');

  const behavior: PermissionBehavior = 'deny';
  const ok = runner.respondPermission('tu-1', behavior);
  assertEquals(ok, true);

  const decision = await decisionPromise;
  assertEquals(decision.behavior, 'deny');
  assertEquals(
    (decision as { message?: string }).message,
    'Denied by user',
  );

  await runner.close();
  assertEquals(runner.state, 'closed');
});
