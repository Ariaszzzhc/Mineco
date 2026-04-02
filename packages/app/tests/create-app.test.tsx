import { NoOpNotificationAdapter, type Platform } from "@mineco/platform";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/create-app";
import { getPlatform } from "../src/lib/platform";

// Mock solid-js/web render to avoid DOM requirement
vi.mock(import("solid-js/web"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    render: vi.fn(),
  };
});

function createTestPlatform(): Platform {
  return {
    name: "web",
    apiBaseUrl: "",
    capabilities: { notification: false, tray: false },
    notification: new NoOpNotificationAdapter(),
  };
}

describe("createApp", () => {
  it("sets the platform globally after rendering", () => {
    const platform = createTestPlatform();
    const AppRoot = createApp(platform);

    // Side effects are lazy — platform not set until first render
    // Calling AppRoot() simulates Solid rendering the component
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
