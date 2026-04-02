import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserNotificationAdapter } from "../../src/platform/notification";

// Store created notification instances for assertions
const notificationInstances: Array<{
  close: ReturnType<typeof vi.fn>;
  onclick: (() => void) | null;
}> = [];

beforeEach(() => {
  notificationInstances.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BrowserNotificationAdapter", () => {
  let adapter: BrowserNotificationAdapter;

  beforeEach(() => {
    adapter = new BrowserNotificationAdapter();
  });

  function stubNotification(permission: NotificationPermission = "granted") {
    const MockNotification = class {
      static permission: NotificationPermission = permission;
      static requestPermission = vi.fn().mockResolvedValue(permission);
      close = vi.fn();
      onclick: (() => void) | null = null;
      constructor(_title: string, _options?: NotificationOptions) {
        notificationInstances.push(
          this as unknown as (typeof notificationInstances)[number],
        );
      }
    };
    vi.stubGlobal("Notification", MockNotification);
    return MockNotification;
  }

  it("reports supported when Notification API exists", () => {
    stubNotification();
    expect(adapter.isSupported()).toBe(true);
  });

  it("reports unsupported when Notification API missing", () => {
    const orig = (globalThis as Record<string, unknown>).Notification;
    delete (globalThis as Record<string, unknown>).Notification;
    expect(adapter.isSupported()).toBe(false);
    if (orig) (globalThis as Record<string, unknown>).Notification = orig;
  });

  it("returns current permission", () => {
    stubNotification("default");
    expect(adapter.getPermission()).toBe("default");
  });

  it("requests permission via browser API", async () => {
    const MockNotification = stubNotification("default");
    // Make requestPermission resolve to "granted" to simulate granting
    MockNotification.requestPermission = vi
      .fn()
      .mockResolvedValue("granted" as NotificationPermission);
    const result = await adapter.requestPermission();
    expect(MockNotification.requestPermission).toHaveBeenCalled();
    expect(result).toBe("granted");
  });

  it("creates a notification and returns an id", async () => {
    stubNotification();
    const id = await adapter.notify("Test Title", "Test Body");
    expect(id).toBeTruthy();
    expect(notificationInstances.length).toBe(1);
  });

  it("closes a notification by id", async () => {
    stubNotification();
    const id = await adapter.notify("Title", "Body");
    adapter.close(id);
    expect(notificationInstances[0].close).toHaveBeenCalled();
  });

  it("registers click handler and fires on click", async () => {
    stubNotification();
    const clickHandler = vi.fn();
    const unsubscribe = adapter.onClick(clickHandler);

    const id = await adapter.notify("Title", "Body");

    // Simulate click
    expect(notificationInstances[0].onclick).toBeTruthy();
    notificationInstances[0].onclick!();

    expect(clickHandler).toHaveBeenCalledWith(id);

    // Cleanup
    unsubscribe();
  });

  it("returns empty string when permission not granted", async () => {
    stubNotification("denied");
    const id = await adapter.notify("Title", "Body");
    expect(id).toBe("");
  });
});
