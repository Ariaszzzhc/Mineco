/**
 * Token-bucket rate limiter for LLM API calls.
 *
 * Shared across all callers in the same process. Prevents parallel
 * subagents from overwhelming the provider with concurrent requests.
 */

export interface RateLimitConfig {
  /** Maximum number of requests that can burst at once */
  maxBurst: number;
  /** How many tokens replenish per second */
  refillRate: number;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly waiters: Array<{ resolve: () => void }> = [];
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly config: RateLimitConfig) {
    this.tokens = config.maxBurst;
    this.lastRefill = Date.now();

    // Periodically drain waiters as tokens refill over time
    this.timer = setInterval(() => this.drainWaiters(), 100);
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiters.push({ resolve });
    });
  }

  /** Stop the internal timer. Call when discarding the limiter. */
  destroy(): void {
    clearInterval(this.timer);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const added = elapsed * this.config.refillRate;
    this.tokens = Math.min(this.config.maxBurst, this.tokens + added);
    this.lastRefill = now;
  }

  private drainWaiters(): void {
    this.refill();
    while (this.tokens >= 1 && this.waiters.length > 0) {
      this.tokens -= 1;
      const waiter = this.waiters.shift()!;
      waiter.resolve();
    }
  }
}
