/* @refresh reload */

import { createApp } from "@mineco/app";
import { render } from "solid-js/web";
import "@mineco/app/index.css";
import { createBrowserPlatform } from "./platform";

const platform = createBrowserPlatform();
const AppRoot = createApp(platform);

const root = document.getElementById("root");

if (root != null) {
  render(AppRoot, root);
}
