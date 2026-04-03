// ---------------------------------------------------------------------------
// Platform types — zero runtime dependencies
// ---------------------------------------------------------------------------

/**
 * Platform identity and capabilities injected at app startup.
 *
 * Different entry points (web, desktop) create different Platform instances
 * and pass them to `createApp()`. Components access the platform via
 * `usePlatform()` or `getPlatform()`.
 */
export interface Platform {
  readonly name: "web" | "desktop";
  readonly apiBaseUrl: string;
  readonly token?: string;
  readonly capabilities: PlatformCapabilities;
  readonly notification: NotificationAdapter;
}

/** Feature flags that vary by platform. */
export interface PlatformCapabilities {
  readonly notification: boolean;
  readonly tray: boolean;
}

// ---------------------------------------------------------------------------
// Notification adapter
// ---------------------------------------------------------------------------

export type NotificationPermission = "granted" | "denied" | "default";

export interface NotifyOptions {
  icon?: string;
  tag?: string;
  silent?: boolean;
}

export type NotificationClickHandler = (notificationId: string) => void;

/**
 * Platform-specific notification implementation.
 *
 * - Browser: uses the Web Notification API
 * - Desktop: uses tauri-plugin-notification
 * - Fallback: {@link NoOpNotificationAdapter}
 */
export interface NotificationAdapter {
  isSupported(): boolean;
  getPermission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  notify(title: string, body: string, options?: NotifyOptions): Promise<string>;
  close(id: string): void;
  onClick(handler: NotificationClickHandler): () => void;
}

/** No-op adapter for unsupported platforms or unit tests. */
export class NoOpNotificationAdapter implements NotificationAdapter {
  isSupported(): boolean {
    return false;
  }
  getPermission(): NotificationPermission {
    return "denied";
  }
  async requestPermission(): Promise<NotificationPermission> {
    return "denied";
  }
  async notify(
    _title?: string,
    _body?: string,
    _options?: NotifyOptions,
  ): Promise<string> {
    return "";
  }
  close(_id: string): void {}
  onClick(_handler: NotificationClickHandler): () => void {
    return () => {};
  }
}
