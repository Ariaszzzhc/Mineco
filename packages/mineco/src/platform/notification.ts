import type {
  NotificationAdapter,
  NotificationClickHandler,
  NotificationPermission,
  NotifyOptions,
} from "@mineco/platform";

/**
 * Tauri notification adapter.
 *
 * Uses dynamic import of `@tauri-apps/plugin-notification` so the
 * code works in test environments where the plugin is not available.
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
      const mod = await import("@tauri-apps/plugin-notification");
      if (mod.requestPermission) {
        await mod.requestPermission();
      }
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
      const mod = await import("@tauri-apps/plugin-notification");
      if (mod.sendNotification) {
        mod.sendNotification({ title, body });
        return `tauri-${Date.now()}`;
      }
    } catch (error) {
      console.warn("[TauriNotification] sendNotification failed:", error);
    }
    return "";
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

    import("@tauri-apps/plugin-notification")
      .then((mod) => {
        if (mod.onNotificationActionPerformed && !this.listenerCleanup) {
          mod.onNotificationActionPerformed((event) => {
            const id = String(event.notification.id ?? "");
            for (const handler of this.clickHandlers) {
              handler(id);
            }
          }).then((unlisten) => {
            this.listenerCleanup = unlisten;
          });
        }
      })
      .catch(() => {
        // Plugin not available (e.g. in tests)
      });
  }
}
