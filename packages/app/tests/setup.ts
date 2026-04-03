import { vi } from "vitest";
import type { Platform } from "../src/lib/platform-types";
import { NoOpNotificationAdapter } from "../src/lib/platform-types";
import { setPlatform } from "../src/lib/platform";

// Mock localStorage for tests (needed by I18nProvider)
const localStorageStore: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
  }),
});

// Mock navigator.language for tests (needed by I18nProvider)
vi.stubGlobal("navigator", { language: "en" });

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
