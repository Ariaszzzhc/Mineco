import { describe, expect, it } from "vitest";
import { TokenBucketRateLimiter } from "../src/rate-limit.js";

describe("TokenBucketRateLimiter", () => {
  describe("basic acquire", () => {
    it("allows burst up to maxBurst", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxBurst: 3,
        refillRate: 1,
      });

      // Should resolve immediately for all 3
      const start = Date.now();
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
      limiter.destroy();
    });

    it("blocks when bucket is empty and resolves after refill", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxBurst: 1,
        refillRate: 1000, // Very fast refill so test completes quickly
      });

      // Drain the bucket
      await limiter.acquire();

      // Next acquire should block then resolve via drainWaiters timer
      const start = Date.now();
      await limiter.acquire();
      const elapsed = Date.now() - start;

      // Should resolve within ~200ms (drainWaiters interval is 100ms)
      expect(elapsed).toBeLessThan(500);
      limiter.destroy();
    });
  });

  describe("FIFO ordering", () => {
    it("resolves waiters in order", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxBurst: 1,
        refillRate: 1000, // Fast refill
      });

      // Drain
      await limiter.acquire();

      const order: number[] = [];
      const p1 = limiter.acquire().then(() => order.push(1));
      const p2 = limiter.acquire().then(() => order.push(2));
      const p3 = limiter.acquire().then(() => order.push(3));

      await Promise.all([p1, p2, p3]);

      expect(order).toEqual([1, 2, 3]);
      limiter.destroy();
    });
  });

  describe("refill", () => {
    it("refills tokens over time", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxBurst: 2,
        refillRate: 1000, // Fast refill
      });

      // Drain
      await limiter.acquire();
      await limiter.acquire();

      // Wait for refill via timer
      await new Promise((r) => setTimeout(r, 200));

      // Should resolve immediately
      const start = Date.now();
      await limiter.acquire();
      await limiter.acquire();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
      limiter.destroy();
    });

    it("caps tokens at maxBurst", async () => {
      const limiter = new TokenBucketRateLimiter({
        maxBurst: 2,
        refillRate: 10,
      });

      // Drain
      await limiter.acquire();
      await limiter.acquire();

      // Wait a long time → tokens should cap at 2
      await new Promise((r) => setTimeout(r, 300));

      // Can acquire 2 but not 3 (3rd should block)
      await limiter.acquire();
      await limiter.acquire();

      let resolved = false;
      const p3 = limiter.acquire().then(() => {
        resolved = true;
      });

      // Not resolved immediately
      await new Promise((r) => setTimeout(r, 10));
      expect(resolved).toBe(false);

      limiter.destroy();
    });
  });
});
