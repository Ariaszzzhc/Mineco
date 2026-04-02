import type { Platform } from "@mineco/platform";
import type { JSX } from "solid-js";
import App from "./App";
import { initHighlighter } from "./lib/markdown";
import { PlatformProvider, setPlatform } from "./lib/platform";
import { applyTheme, lightTokens } from "./theme";

/**
 * Create the application root component with the given platform.
 *
 * Called by the platform-specific entry points (web / desktop).
 * Side effects (theme, highlighter) run lazily on first render
 * so repeated calls in tests don't pollute global state.
 */
export function createApp(platform: Platform): () => JSX.Element {
  let initialized = false;

  return function AppRoot() {
    if (!initialized) {
      initialized = true;
      setPlatform(platform);
      applyTheme(lightTokens);
      initHighlighter();
    }

    return (
      <PlatformProvider value={platform}>
        <App />
      </PlatformProvider>
    );
  };
}
