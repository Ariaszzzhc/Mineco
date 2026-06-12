import { assertEquals } from 'jsr:@std/assert@1';
import { PermissionGate } from './permission.ts';

Deno.test('PermissionGate resolves when respond() is called', async () => {
  const gate = new PermissionGate();
  const p = gate.request('t1', 1000);
  const ok = gate.respond('t1', { behavior: 'allow' });
  assertEquals(ok, true);
  assertEquals((await p).behavior, 'allow');
});

Deno.test('PermissionGate denies on timeout', async () => {
  const gate = new PermissionGate();
  const p = gate.request('t1', 5);
  // setTimeout in Deno needs -A/--no-prompt for time, but we await directly.
  assertEquals((await p).behavior, 'deny');
});

Deno.test('PermissionGate respond() returns false for unknown id', () => {
  const gate = new PermissionGate();
  assertEquals(gate.respond('nope', { behavior: 'deny' }), false);
});

Deno.test('PermissionGate cancel() resolves pending request with deny', async () => {
  const gate = new PermissionGate();
  const p = gate.request('t2', 60_000); // long timeout — should not fire
  gate.cancel('t2');
  const decision = await p;
  assertEquals(decision.behavior, 'deny');
  assertEquals(decision.message, 'session closed');
});

Deno.test('PermissionGate clear() resolves all pending requests with deny', async () => {
  const gate = new PermissionGate();
  const p1 = gate.request('a', 60_000);
  const p2 = gate.request('b', 60_000);
  gate.clear();
  const [d1, d2] = await Promise.all([p1, p2]);
  assertEquals(d1.behavior, 'deny');
  assertEquals(d2.behavior, 'deny');
});
