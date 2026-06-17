<!--
  App.svelte — the single-window router. Renders one of the three full-screen
  views based on nav.view. Each view owns its own titlebar/sidebar layout; this
  shell stays thin. On mount it initializes appearance (applies <html> attrs)
  and loads the workspace list.
-->
<script lang="ts">
import { onMount } from "svelte";
import { nav } from "./lib/stores/nav.svelte";
import { theme } from "./lib/stores/theme.svelte";
import { workspaces } from "./lib/stores/workspace.svelte";
import Chat from "./lib/views/Chat.svelte";
import Home from "./lib/views/Home.svelte";
import Settings from "./lib/views/Settings.svelte";

onMount(() => {
  void theme.init();
  void workspaces.load();
});
</script>

{#if nav.view === "home"}
  <Home />
{:else if nav.view === "chat"}
  <Chat />
{:else if nav.view === "settings"}
  <Settings />
{/if}
