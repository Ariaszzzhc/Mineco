/**
 * AsyncQueue — the backbone of streaming-input `query()` (§3, §7).
 *
 * The SDK's `query({ prompt: AsyncIterable<SDKUserMessage> })` consumes a
 * prompt stream; we feed it by pushing into this queue from each `session/send`.
 * Closing the queue signals end-of-turn-input to the SDK.
 *
 * Pure async logic — no SDK, no I/O — so it is unit-testable in isolation (§11).
 */
export class AsyncQueue<T> implements AsyncIterable<T>, AsyncDisposable {
  private buffered: T[] = [];
  private waiters: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;
  private err: unknown = null;

  /** Push a value to be yielded to the consumer. No-op after close. */
  push(value: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ done: false, value });
    } else {
      this.buffered.push(value);
    }
  }

  /** End the stream. Consumers see `{ done: true }` once drained. */
  close(cause?: unknown): void {
    if (this.closed) return;
    this.closed = true;
    if (cause !== undefined) this.err = cause;
    // Resolve all waiters as done; the iterator throws `err` (if any) after.
    for (const w of this.waiters.splice(0)) {
      w({ done: true, value: undefined as never });
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      if (this.buffered.length > 0) {
        yield this.buffered.shift() as T;
        continue;
      }
      if (this.closed) {
        if (this.err !== null) throw this.err;
        return;
      }
      const next = await new Promise<IteratorResult<T>>((resolve) => {
        this.waiters.push(resolve);
      });
      if (next.done) {
        if (this.err !== null) throw this.err;
        return;
      }
      yield next.value;
    }
  }

  // deno-lint-ignore require-await
  async [Symbol.asyncDispose](): Promise<void> {
    this.close();
  }
}
