import type {
  NotificationAdapter,
  NotificationClickHandler,
  NotificationPermission,
  NotifyOptions,
} from "@mineco/app";
import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/**
 * Tauri notification adapter.
 */
export class TauriNotificationAdapter implements NotificationAdapter {
  private clickHandlers: NotificationClickHandler[] = [];
  private listenerCleanup: (() => void) | null = null;

  isSupported(): boolean {
    return true;
  }

  getPermission(): NotificationPermission {
    return "granted";
  }

  async requestPermission(): Promise<NotificationPermission> {
    try {
      await requestPermission();
    } catch (error) {
      console.warn("[TauriNotification] requestPermission failed:", error);
    }
    return "granted";
  }

  async notify(
    title: string,
    body: string,
    _options?: NotifyOptions,
  ): Promise<string> {
    try {
      const permitted = await isPermissionGranted();
      if (!permitted) {
        const permission = await requestPermission();
        if (permission !== "granted") return "";
      }
      sendNotification({ title, body });
      return `tauri-${Date.now()}`;
    } catch (error) {
      console.warn("[TauriNotification] sendNotification failed:", error);
      return "";
    }
  }

  close(_id: string): void {
    // Tauri notifications are managed by the OS
  }

  onClick(handler: NotificationClickHandler): () => void {
    this.clickHandlers.push(handler);
    this.ensureClickListener();

    return () => {
      const idx = this.clickHandlers.indexOf(handler);
      if (idx !== -1) {
        this.clickHandlers.splice(idx, 1);
      }
    };
  }

  private ensureClickListener(): void {
    if (this.listenerCleanup) return;

    onAction((notification) => {
      const id = String(notification.id ?? "");
      for (const handler of this.clickHandlers) {
        handler(id);
      }
    })
      .then((listener) => {
        this.listenerCleanup = () => listener.unregister();
      })
      .catch(() => {
        // Plugin not available (e.g. in tests)
      });
  }
}
