import { vi } from "vitest";
import type { Platform } from "../src/lib/platform-types";
import { NoOpNotificationAdapter } from "../src/lib/platform-types";
import { setPlatform } from "../src/lib/platform";

// Initialize Platform singleton for tests
const testPlatform: Platform = {
  name: "web",
  apiBaseUrl: "",
  capabilities: { notification: false, tray: false },
  notification: new NoOpNotificationAdapter(),
};
setPlatform(testPlatform);

// Suppress console.warn noise from SSE parse warnings etc.
const _originalWarn = console.warn;
console.warn = vi.fn((..._args: unknown[]) => {
  // Uncomment to debug: originalWarn.apply(console, args);
});
