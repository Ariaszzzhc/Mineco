/**
 * A minimal single-consumer async queue (a "pushable" async iterable).
 *
 * Producers call {@link push} to enqueue values and {@link end} / {@link fail}
 * to terminate the stream; a single consumer drains it with `for await`. Buffered
 * values are always delivered before a terminal `end`/`fail` is observed.
 *
 * Two roles in the Claude adapter:
 *   - the session's persistent **input stream** (`AsyncQueue<SDKUserMessage>`),
 *     which stays open for the session's lifetime so `query()` never finalizes
 *     until the session is closed;
 *   - each turn's **output channel** (`AsyncQueue<NormalizedEvent>`), which the
 *     long-lived consumer loop writes into and the turn's iterator drains until
 *     the terminal `result`/`error` ends it.
 *
 * It is intentionally single-consumer: each `[Symbol.asyncIterator]()` shares
 * the same backing buffer, so create one queue per stream.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private values: T[] = [];
  private wake: (() => void) | null = null;
  private done = false;
  private error: unknown = null;

  /** Enqueue a value (no-op once the queue has ended/failed). */
  push(value: T): void {
    if (this.done) return;
    this.values.push(value);
    this.signal();
  }

  /** Close the stream after the buffered values drain. */
  end(): void {
    if (this.done) return;
    this.done = true;
    this.signal();
  }

  /** Close the stream by throwing `error` once buffered values drain. */
  fail(error: unknown): void {
    if (this.done) return;
    this.error = error;
    this.done = true;
    this.signal();
  }

  private signal(): void {
    const w = this.wake;
    this.wake = null;
    w?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      while (this.values.length) {
        yield this.values.shift() as T;
      }
      if (this.error) throw this.error;
      if (this.done) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }
}
