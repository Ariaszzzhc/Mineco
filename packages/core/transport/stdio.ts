/**
 * stdio binding for the JSON-RPC codec (§4, §8).
 *
 * Inbound: read stdin line-by-line → decode → dispatch to the server.
 * Outbound: server writes frames → serialize → stdout (one per line).
 *
 * Everything else (stderr, logs) MUST stay off stdout to keep the protocol
 * channel clean.
 */
import { type JsonRpcMessage, NotificationMethod } from '@/protocol';
import { decode, encode, type MessageWriter } from './jsonrpc.ts';

/** A handler invoked for each validated inbound request/notification. */
export interface InboundHandler {
  onMessage(msg: JsonRpcMessage): void | Promise<void>;
}

/** Minimal byte-source interface (Deno.stdin satisfies this). */
export interface ByteSource {
  read(p: Uint8Array): Promise<number | null>;
  close(): void;
}

/** Reader that yields inbound lines from the given source. Defaults to stdin. */
export async function* readLines(
  reader: ByteSource = Deno.stdin,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const buf = new Uint8Array(64 * 1024);
  let carry = '';

  while (true) {
    let n: number | null;
    try {
      n = await reader.read(buf);
    } catch {
      return;
    }
    if (n === null) break;

    carry += decoder.decode(buf.subarray(0, n), { stream: true });
    let nl: number;
    while ((nl = carry.indexOf('\n')) >= 0) {
      const line = carry.slice(0, nl).replace(/\r$/, '');
      carry = carry.slice(nl + 1);
      if (line.trim().length > 0) yield line;
    }
  }
  if (carry.trim().length > 0) yield carry;
}

/** Writer that emits outbound frames to stdout. */
export function stdoutWriter(): MessageWriter & AsyncDisposable {
  const encoder = new TextEncoder();
  return {
    write(frame: JsonRpcMessage): void {
      const line = encode(frame) + '\n';
      Deno.stdout.writeSync(encoder.encode(line));
    },
    async [Symbol.asyncDispose](): Promise<void> {
      // Keep stdout ownership central; nothing to release here.
    },
  };
}

/**
 * Run the stdio loop: read frames, decode, hand valid ones to the handler,
 * and write parse errors back as JSON-RPC responses. Resolves on EOF.
 *
 * The optional `onReady` fires once the loop is primed (§8: ready notification
 * is diagnostic only).
 */
export async function runStdio(
  handler: InboundHandler,
  opts: { onReady?: () => void } = {},
): Promise<void> {
  const writer = stdoutWriter();

  for await (const line of readLines()) {
    const decoded = decode(line);
    if (!decoded.ok) {
      // No valid id to echo; surface as a parse/invalid notification.
      writer.write({
        jsonrpc: '2.0',
        method: NotificationMethod.Error,
        params: { code: decoded.code, message: decoded.message },
      });
      continue;
    }
    await handler.onMessage(decoded.message);
  }

  opts.onReady?.();
}
