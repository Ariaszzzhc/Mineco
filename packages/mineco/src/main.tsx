/* @refresh reload */

import { createApp } from "@mineco/app";
import { render } from "solid-js/web";
import { createTauriPlatform } from "./platform";
import "@mineco/app/index.css";

const apiUrl = (window as unknown as Record<string, string>).__MINECO_API_URL__;

const platform = createTauriPlatform(apiUrl ?? "");
const AppRoot = createApp(platform);

const root = document.getElementById("root");

if (root != null) {
  render(AppRoot, root);
}
