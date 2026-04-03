import type { Platform } from "@mineco/app";
import { TauriDirectoryPickerAdapter } from "./directory-picker";
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
    capabilities: { notification: true, tray: true, directoryPicker: true },
    notification: new TauriNotificationAdapter(),
    directoryPicker: new TauriDirectoryPickerAdapter(),
  };
}
