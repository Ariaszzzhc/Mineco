import { describe, expect, it } from "vitest";
import { Mutex } from "../../src/storage/mutex.js";

describe("Mutex", () => {
  it("should lock and unlock immediately when uncontested", async () => {
    const mutex = new Mutex();
    await mutex.lock();
    mutex.unlock();
    // If we get here without hanging, the test passes
    expect(true).toBe(true);
  });

  it("should queue second lock until first unlocks", async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    const p1 = (async () => {
      await mutex.lock();
      order.push(1);
      await new Promise((r) => setTimeout(r, 50));
      mutex.unlock();
    })();

    const p2 = (async () => {
      await mutex.lock();
      order.push(2);
      mutex.unlock();
    })();

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it("should release waiters in FIFO order", async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    const p1 = (async () => {
      await mutex.lock();
      order.push(1);
      await new Promise((r) => setTimeout(r, 30));
      mutex.unlock();
    })();

    const p2 = (async () => {
      await mutex.lock();
      order.push(2);
      await new Promise((r) => setTimeout(r, 30));
      mutex.unlock();
    })();

    const p3 = (async () => {
      await mutex.lock();
      order.push(3);
      mutex.unlock();
    })();

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("should not throw when unlock is called without lock", () => {
    const mutex = new Mutex();
    expect(() => mutex.unlock()).not.toThrow();
  });

  it("should support repeated lock/unlock cycles", async () => {
    const mutex = new Mutex();
    for (let i = 0; i < 5; i++) {
      await mutex.lock();
      mutex.unlock();
    }
    expect(true).toBe(true);
  });
});
