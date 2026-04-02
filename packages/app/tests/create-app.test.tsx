import { describe, expect, it, vi } from "vitest";
import { NoOpNotificationAdapter, type Platform } from "@mineco/platform";
import { getPlatform } from "../src/lib/platform";
import { createApp } from "../src/create-app";

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
  it("sets the platform globally", () => {
    const platform = createTestPlatform();
    createApp(platform);
    expect(getPlatform()).toBe(platform);
  });

  it("returns a root component function", () => {
    const platform = createTestPlatform();
    const AppRoot = createApp(platform);
    expect(typeof AppRoot).toBe("function");
  });
});
