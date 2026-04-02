/* @refresh reload */
import { render } from "solid-js/web";
import { createApp } from "@mineco/app";
import { createBrowserPlatform } from "./platform";
import "@mineco/app/index.css";

const platform = createBrowserPlatform();
const AppRoot = createApp(platform);

const root = document.getElementById("root");

if (root != null) {
  render(AppRoot, root);
}
