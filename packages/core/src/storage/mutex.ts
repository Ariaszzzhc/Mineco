export class Mutex {
  #promise: Promise<void> | undefined;
  #resolve: (() => void) | undefined;

  async lock(): Promise<void> {
    while (this.#promise) await this.#promise;
    const { resolve, promise } = Promise.withResolvers<void>();
    this.#promise = promise;
    this.#resolve = resolve;
  }

  unlock(): void {
    const resolve = this.#resolve;
    this.#promise = undefined;
    this.#resolve = undefined;
    resolve?.();
  }
}
