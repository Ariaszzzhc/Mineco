import { describe, expect, it, vi } from "vitest";
import { TauriNotificationAdapter } from "../../src/platform/notification";

const mockOnAction = vi.fn().mockResolvedValue({ unregister: vi.fn() });

// Mock the Tauri notification plugin
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue("granted"),
  sendNotification: vi.fn(),
  onAction: (...args: unknown[]) => mockOnAction(...args),
}));

describe("TauriNotificationAdapter", () => {
  it("is always supported", () => {
    const adapter = new TauriNotificationAdapter();
    expect(adapter.isSupported()).toBe(true);
  });

  it("returns granted permission by default", () => {
    const adapter = new TauriNotificationAdapter();
    expect(adapter.getPermission()).toBe("granted");
  });

  it("requests permission via Tauri plugin", async () => {
    const adapter = new TauriNotificationAdapter();
    const permission = await adapter.requestPermission();
    expect(permission).toBe("granted");
  });

  it("sends notification via Tauri plugin", async () => {
    const adapter = new TauriNotificationAdapter();
    const id = await adapter.notify("Title", "Body");
    expect(id).toBeTruthy();
    expect(id).toMatch(/^tauri-/);
  });

  it("close does not throw", () => {
    const adapter = new TauriNotificationAdapter();
    expect(() => adapter.close("any-id")).not.toThrow();
  });

  it("onClick registers handler and returns unsubscribe", () => {
    const adapter = new TauriNotificationAdapter();
    const handler = vi.fn();
    const unsubscribe = adapter.onClick(handler);
    expect(typeof unsubscribe).toBe("function");

    // Unsubscribe should remove handler
    unsubscribe();
    // Calling again should not throw
    expect(() => unsubscribe()).not.toThrow();
  });

  it("subscribes to Tauri notification action events", async () => {
    const adapter = new TauriNotificationAdapter();
    const handler = vi.fn();
    adapter.onClick(handler);

    // Wait for dynamic import + event subscription
    await vi.waitFor(() => {
      expect(mockOnAction).toHaveBeenCalled();
    });
  });
});
