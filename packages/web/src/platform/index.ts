import type { Platform } from "@mineco/app";
import { BrowserNotificationAdapter } from "./notification";

/**
 * Create a Platform for the browser/web environment.
 *
 * Extracts the auth token from URL search params (if present),
 * removes it from the URL for cleanliness.
 */
export function createBrowserPlatform(): Platform {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (token) {
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
  }

  return {
    name: "web",
    apiBaseUrl: "",
    ...(token ? { token } : {}),
    capabilities: { notification: true, tray: false },
    notification: new BrowserNotificationAdapter(),
  };
}
