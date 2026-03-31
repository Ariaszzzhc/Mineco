/* @refresh reload */
import { render } from "solid-js/web";
import "./index.css";
import App from "./App";
import { initHighlighter } from "./lib/markdown";
import { createPlatform, PlatformProvider } from "./lib/platform";
import { applyTheme, lightTokens } from "./theme";

applyTheme(lightTokens);
initHighlighter();

const root = document.getElementById("root");

if (root != null) {
  render(
    () => (
      <PlatformProvider value={createPlatform()}>
        <App />
      </PlatformProvider>
    ),
    root,
  );
}
