import { describe, expect, it } from "vitest";
import {
  NoOpNotificationAdapter,
  type NotificationAdapter,
  type NotificationPermission,
  type NotifyOptions,
  type Platform,
  type PlatformCapabilities,
  type NotificationClickHandler,
} from "../src/lib/platform-types";

describe("NoOpNotificationAdapter", () => {
  it("reports unsupported", () => {
    const adapter = new NoOpNotificationAdapter();
    expect(adapter.isSupported()).toBe(false);
  });

  it("returns denied permission", () => {
    const adapter = new NoOpNotificationAdapter();
    expect(adapter.getPermission()).toBe("denied");
  });

  it("requestPermission returns denied", async () => {
    const adapter = new NoOpNotificationAdapter();
    const perm = await adapter.requestPermission();
    expect(perm).toBe("denied");
  });

  it("notify returns empty string", async () => {
    const adapter = new NoOpNotificationAdapter();
    const id = await adapter.notify("title", "body");
    expect(id).toBe("");
  });

  it("close does not throw", () => {
    const adapter = new NoOpNotificationAdapter();
    expect(() => adapter.close("any-id")).not.toThrow();
  });

  it("onClick returns a cleanup function", () => {
    const adapter = new NoOpNotificationAdapter();
    const cleanup = adapter.onClick(() => {});
    expect(typeof cleanup).toBe("function");
    expect(() => cleanup()).not.toThrow();
  });
});

describe("type exports", () => {
  it("Platform type can be used", () => {
    const adapter: NotificationAdapter = new NoOpNotificationAdapter();
    const capabilities: PlatformCapabilities = {
      notification: false,
      tray: false,
    };
    const platform: Platform = {
      name: "web",
      apiBaseUrl: "",
      capabilities,
      notification: adapter,
    };
    expect(platform.name).toBe("web");
    expect(platform.capabilities.notification).toBe(false);
    expect(platform.notification.isSupported()).toBe(false);
  });
});
