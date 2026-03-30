/**
 * Returns the base URL for API requests.
 * - Desktop (Tauri): reads from window.__MINECO_API_URL__ injected at runtime by Rust
 * - Web browser: returns "" (relative URLs, Vite proxy handles it)
 *
 * No Tauri dependency — the desktop shell injects the URL before the webview loads.
 */
let _cachedBaseUrl: string | null = null;

export async function getApiBaseUrl(): Promise<string> {
  if (_cachedBaseUrl !== null) return _cachedBaseUrl;

  if (typeof window !== "undefined" && "__MINECO_API_URL__" in window) {
    _cachedBaseUrl = (window as unknown as { __MINECO_API_URL__: string }).__MINECO_API_URL__;
  } else {
    _cachedBaseUrl = "";
  }

  return _cachedBaseUrl;
}
