import type { Platform } from "@mineco/platform";
import type { JSX } from "solid-js";
import { PlatformProvider, setPlatform } from "./lib/platform";
import { initHighlighter } from "./lib/markdown";
import { applyTheme, lightTokens } from "./theme";
import App from "./App";

/**
 * Create the application root component with the given platform.
 *
 * Called by the platform-specific entry points (web / desktop).
 * Sets up the platform singleton, theme, markdown highlighter, and
 * wraps the app in a PlatformProvider.
 */
export function createApp(platform: Platform): () => JSX.Element {
  setPlatform(platform);
  applyTheme(lightTokens);
  initHighlighter();

  return function AppRoot() {
    return (
      <PlatformProvider value={platform}>
        <App />
      </PlatformProvider>
    );
  };
}
