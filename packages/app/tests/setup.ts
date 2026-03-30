import { vi } from "vitest";

// Suppress console.warn noise from SSE parse warnings etc.
const originalWarn = console.warn;
console.warn = vi.fn((...args: unknown[]) => {
  // Uncomment to debug: originalWarn.apply(console, args);
});
