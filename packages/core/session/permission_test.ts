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
