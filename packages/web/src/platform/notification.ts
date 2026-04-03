import type {
  NotificationAdapter,
  NotificationClickHandler,
  NotificationPermission,
  NotifyOptions,
} from "@mineco/app";

/**
 * Browser notification adapter using the Web Notification API.
 */
export class BrowserNotificationAdapter implements NotificationAdapter {
  private activeNotifications = new Map<string, Notification>();
  private clickHandlers: NotificationClickHandler[] = [];

  isSupported(): boolean {
    return "Notification" in window;
  }

  getPermission(): NotificationPermission {
    if (!this.isSupported()) return "denied";
    return Notification.permission as NotificationPermission;
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return "denied";
    const result = await Notification.requestPermission();
    return result as NotificationPermission;
  }

  async notify(
    title: string,
    body: string,
    options?: NotifyOptions,
  ): Promise<string> {
    if (!this.isSupported() || this.getPermission() !== "granted") {
      return "";
    }

    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const notification = new Notification(title, {
      body,
      ...(options?.tag ? { tag: options.tag } : {}),
      ...(options?.silent ? { silent: options.silent } : {}),
      ...(options?.icon ? { icon: options.icon } : {}),
    });

    notification.onclick = () => {
      for (const handler of this.clickHandlers) {
        handler(id);
      }
    };

    this.activeNotifications.set(id, notification);
    return id;
  }

  close(id: string): void {
    const notification = this.activeNotifications.get(id);
    if (notification) {
      notification.close();
      this.activeNotifications.delete(id);
    }
  }

  onClick(handler: NotificationClickHandler): () => void {
    this.clickHandlers.push(handler);
    return () => {
      const idx = this.clickHandlers.indexOf(handler);
      if (idx !== -1) {
        this.clickHandlers.splice(idx, 1);
      }
    };
  }
}
