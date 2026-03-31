import { onMount, type JSX } from "solid-js";
import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";
import { configStore } from "../../stores/config";

async function loadConfigWithRetry() {
  for (let i = 0; i < 30; i++) {
    try {
      await configStore.loadConfig();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export function AppLayout(props: { children: JSX.Element }) {
  onMount(() => {
    if (!configStore.config()) {
      loadConfigWithRetry();
    }
  });

  return (
    <div class="flex h-screen bg-[var(--background)]">
      <Sidebar />
      <div class="flex flex-1 min-w-0 flex-col">
        <main class="flex-1 overflow-hidden">{props.children}</main>
        <StatusBar />
      </div>
    </div>
  );
}
