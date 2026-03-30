import type { JSX } from "solid-js";
import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";

export function AppLayout(props: { children: JSX.Element }) {
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
