import { assert, assertEquals } from 'jsr:@std/assert@1';
import { AsyncQueue } from './async_queue.ts';

Deno.test('AsyncQueue yields pushed values then completes on close', async () => {
  const q = new AsyncQueue<number>();
  q.push(1);
  q.push(2);
  q.close();

  const out: number[] = [];
  for await (const v of q) out.push(v);
  assertEquals(out, [1, 2]);
});

Deno.test('AsyncQueue delivers values pushed after iteration starts', async () => {
  const q = new AsyncQueue<string>();
  const seen: string[] = [];
  const iter = (async () => {
    for await (const v of q) seen.push(v);
  })();

  q.push('a');
  await Promise.resolve();
  q.push('b');
  await Promise.resolve();
  q.close();
  await iter;

  assertEquals(seen, ['a', 'b']);
});

Deno.test('AsyncQueue rethrows a close cause to the consumer', async () => {
  const q = new AsyncQueue<number>();
  q.close(new Error('boom'));
  let caught: unknown = null;
  try {
    for await (const _ of q) void _;
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof Error);
  assertEquals((caught as Error).message, 'boom');
});
