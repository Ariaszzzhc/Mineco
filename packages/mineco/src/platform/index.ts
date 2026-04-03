import type { Platform } from "@mineco/app";
import { TauriNotificationAdapter } from "./notification";

/**
 * Create a Platform for the Tauri desktop environment.
 *
 * @param apiUrl - The sidecar API URL injected via window.__MINECO_API_URL__
 */
export function createTauriPlatform(apiUrl: string): Platform {
  return {
    name: "desktop",
    apiBaseUrl: apiUrl,
    capabilities: { notification: true, tray: true },
    notification: new TauriNotificationAdapter(),
  };
}
