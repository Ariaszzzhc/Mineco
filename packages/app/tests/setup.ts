import { vi } from "vitest";
import type { Platform } from "../src/lib/platform-types";
import { NoOpDirectoryPickerAdapter, NoOpNotificationAdapter } from "../src/lib/platform-types";
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
    for (const k of Object.keys(localStorageStore)) {
      delete localStorageStore[k];
    }
  }),
});

// Mock navigator.language for tests (needed by I18nProvider)
vi.stubGlobal("navigator", { ...globalThis.navigator, language: "en" });

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
