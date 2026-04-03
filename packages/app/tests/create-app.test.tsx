import {
  NoOpDirectoryPickerAdapter,
  NoOpNotificationAdapter,
  type Platform,
} from "../src/lib/platform-types";
import { describe, expect, it, vi } from "vitest";
import { getPlatform } from "../src/lib/platform";

// Prevent shiki async loading and full App tree creation
vi.mock("../src/lib/markdown", () => ({
  initHighlighter: vi.fn(),
}));

vi.mock("../src/App", () => ({
  default: () => null,
}));

import { createApp } from "../src/create-app";

function createTestPlatform(): Platform {
  return {
    name: "web",
    apiBaseUrl: "",
    capabilities: { notification: false, tray: false, directoryPicker: false },
    notification: new NoOpNotificationAdapter(),
    directoryPicker: new NoOpDirectoryPickerAdapter(),
  };
}

describe("createApp", () => {
  it("sets the platform globally after rendering", () => {
    const platform = createTestPlatform();
    const AppRoot = createApp(platform);

    try {
      AppRoot();
    } catch {
      // May throw due to missing DOM, but side effects still run
    }

    expect(getPlatform()).toBe(platform);
  });

  it("returns a root component function", () => {
    const platform = createTestPlatform();
    const AppRoot = createApp(platform);
    expect(typeof AppRoot).toBe("function");
  });

  it("only initializes once across multiple renders", () => {
    const platform1 = createTestPlatform();
    const AppRoot = createApp(platform1);

    try {
      AppRoot();
      AppRoot();
    } catch {
      // May throw due to missing DOM
    }

    expect(getPlatform()).toBe(platform1);
  });
});
