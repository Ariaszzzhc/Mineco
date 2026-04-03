import { vi } from "vitest";
import type { Platform } from "../src/lib/platform-types";
import { NoOpDirectoryPickerAdapter, NoOpNotificationAdapter } from "../src/lib/platform-types";
import { setPlatform } from "../src/lib/platform";

// Initialize Platform singleton for tests
const testPlatform: Platform = {
  name: "web",
  apiBaseUrl: "",
  capabilities: { notification: false, tray: false, directoryPicker: false },
  notification: new NoOpNotificationAdapter(),
  directoryPicker: new NoOpDirectoryPickerAdapter(),
};
setPlatform(testPlatform);

// Suppress console.warn noise from SSE parse warnings etc.
const _originalWarn = console.warn;
console.warn = vi.fn((..._args: unknown[]) => {
  // Uncomment to debug: originalWarn.apply(console, args);
});
