/**
 * Returns the API base URL from the current Platform.
 *
 * Use getApiBaseUrl() in non-reactive contexts (utilities, stores).
 * Use usePlatform() from lib/platform for reactive component access.
 */
import { getPlatform } from "./platform";

export function getApiBaseUrl(): string {
  return getPlatform().apiBaseUrl;
}
