import { vi } from "vitest";
import { setPlatform, createWebPlatform } from "../src/lib/platform";

// Initialize Platform singleton for tests
setPlatform(createWebPlatform());

// Suppress console.warn noise from SSE parse warnings etc.
const originalWarn = console.warn;
console.warn = vi.fn((...args: unknown[]) => {
  // Uncomment to debug: originalWarn.apply(console, args);
});
