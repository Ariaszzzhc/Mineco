/* @refresh reload */
import { render } from "solid-js/web";
import "./index.css";
import { applyTheme, lightTokens } from "./theme";
import { initHighlighter } from "./lib/markdown";
import App from "./App";

applyTheme(lightTokens);
initHighlighter();

const root = document.getElementById("root");

if (root != null) {
  render(() => <App />, root);
}
