/**
 * mineco-core entry point (§8).
 *
 * Lifecycle: open DB → run migrations → wire JSON-RPC codec → stdio read loop.
 * No handshake: client (SwiftUI) spawns this process and starts issuing
 * requests immediately (§8).
 *
 * Run (dev):   deno run --unstable -A packages/core/bin/main.ts
 * Run (built): ./mineco-core   (deno compile output, §9.2)
 */
import { openDb } from '../db/kysely.ts';
import { migrate } from '../db/migrator.ts';
import { makeRunnerSink, Server } from '../server.ts';
import { runStdio, stdoutWriter } from '../transport/stdio.ts';
import { SessionManager } from '../session/manager.ts';

const VERSION = '0.1.0';

async function main(): Promise<void> {
  const db = openDb();
  migrate(db, []); // migrations wired in step 3

  const send = stdoutWriter();
  const sink = makeRunnerSink(send);
  const server = new Server({
    send,
    managers: { sessions: new SessionManager(sink) },
  });

  // Diagnostic only (§8).
  send.write({ jsonrpc: '2.0', method: 'ready', params: { pid: Deno.pid, version: VERSION } });

  await runStdio(server);

  db.close();
}

if (import.meta.main) {
  await main();
}
