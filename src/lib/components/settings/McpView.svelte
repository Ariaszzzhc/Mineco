<!--
  McpView — MCP servers list with scope filter, inline toggle, and expandable
  detail rows. Data is filesystem-backed (McpServerEntry with scope/transport).
  toggle() persists per-name enable/disable. writeScope() persists edits.
-->
<script lang="ts">
import { i18n } from "../../stores/i18n.svelte";
import Icon from "../../ui/Icon.svelte";
import SwitchUI from "../../ui/Switch.svelte";
import { onMount } from "svelte";
import type { McpServerEntry } from "../../agent-protocol";
import { workspaces } from "../../stores/workspace.svelte";

let servers = $state<McpServerEntry[]>([]);
let openName = $state<string | null>(null);
let filter = $state<"all" | "global" | "project" | "local">("all");

const SCOPES = ["global", "project", "local"] as const;

onMount(async () => {
  servers = (await window.mineco.mcp.list(workspaces.currentId ?? null)) ?? [];
});

// scope counts
const scopeCounts = $derived({
  all: servers.length,
  global: servers.filter((s) => s.scope === "global").length,
  project: servers.filter((s) => s.scope === "project").length,
  local: servers.filter((s) => s.scope === "local").length,
});

const shown = $derived(
  filter === "all" ? servers : servers.filter((s) => s.scope === filter),
);

const enabledCount = $derived(servers.filter((s) => s.enabled).length);

async function toggleServer(name: string) {
  const idx = servers.findIndex((s) => s.name === name);
  if (idx === -1) return;
  const next = !servers[idx].enabled;
  servers[idx] = { ...servers[idx], enabled: next };
  await window.mineco.mcp.toggle(name, next, workspaces.currentId ?? null);
}

function scopeClass(scope: string) {
  if (scope === "project")
    return "text-accent-tx bg-accent-bg border-accent-ln";
  if (scope === "local")
    return "text-amber bg-amber-bg border-[color-mix(in_oklab,var(--amber)_34%,transparent)]";
  return "text-ink-2 bg-card-2 border-line";
}
</script>

<div class="flex items-end gap-3">
  <div class="flex-1 min-w-0">
    <h1 class="m-0 font-bold text-[22px] leading-tight tracking-tight text-ink">
      {i18n.t("settings.mcp")}
    </h1>
    <p class="mt-1.5 text-ink-2 text-[13.5px] leading-[1.55] max-w-[60ch]">
      External tools the engine can call. {enabledCount} of {servers.length} enabled.
    </p>
  </div>
</div>

<!-- Scope filter tabs -->
<div class="flex items-center gap-1.5 flex-wrap -mt-1">
  {#each [{ id: "all", lb: "All" }, ...SCOPES.map((s) => ({ id: s, lb: i18n.t(`scope.${s}`) }))] as tab (tab.id)}
    <button
      type="button"
      onclick={() => (filter = tab.id as typeof filter)}
      class="mc-no-drag inline-flex items-center gap-1.5 cursor-pointer border rounded-full px-3 py-[5px] font-ui font-semibold text-[12px] transition-colors {filter === tab.id
        ? 'bg-accent-bg text-accent-tx border-accent-ln'
        : 'border-line bg-card text-ink-2 hover:bg-card-2 hover:text-ink'}"
    >
      {tab.lb}
      <span class="font-mono text-[10px] opacity-80">{scopeCounts[tab.id as keyof typeof scopeCounts]}</span>
    </button>
  {/each}
</div>

<div class="bg-card border border-line rounded-[var(--r-card)] overflow-hidden">
  <div class="flex flex-col">
    {#each shown as sv (sv.name + sv.scope)}
      {@const isOpen = openName === (sv.name + sv.scope)}
      <!-- Row -->
      <div class="flex flex-col border-t border-line first:border-t-0">
        <button
          type="button"
          onclick={() => (openName = isOpen ? null : sv.name + sv.scope)}
          class="mc-no-drag flex items-center gap-3 px-4 py-3 cursor-pointer bg-transparent w-full text-left hover:bg-card-2 transition-colors"
        >
          <!-- status dot -->
          <span
            class="w-2 h-2 rounded-full flex-none {sv.enabled
              ? 'bg-ok shadow-[0_0_0_3px_color-mix(in_oklab,var(--ok)_22%,transparent)]'
              : 'bg-ink-3'}"
          ></span>
          <span class="flex-1 min-w-0 flex flex-col">
            <span class="font-[650] font-mono text-[13px] text-ink truncate">{sv.name}</span>
            <span class="font-mono text-[10.5px] text-ink-3">{sv.enabled ? "enabled" : "disabled"}</span>
          </span>
          <!-- scope pill -->
          <span class="font-mono text-[9.5px] font-semibold tracking-widest uppercase px-[7px] py-[2px] rounded-full border flex-none {scopeClass(sv.scope)}">
            {i18n.t(`scope.${sv.scope}`)}
          </span>
          <!-- transport tag -->
          <span class="font-mono text-[9.5px] font-semibold tracking-widest uppercase text-ink-2 bg-card-2 border border-line px-[7px] py-[2px] rounded-full flex-none">
            {sv.transport}
          </span>
          <!-- toggle (stop propagation) -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span onclick={(e) => { e.stopPropagation(); toggleServer(sv.name); }}>
            <SwitchUI checked={sv.enabled} label={sv.enabled ? "Disable" : "Enable"} onCheckedChange={() => toggleServer(sv.name)} />
          </span>
          <span class="text-ink-3 transition-transform {isOpen ? 'rotate-180' : ''}">
            <Icon name="chev" size={13} />
          </span>
        </button>

        <!-- Expanded detail -->
        {#if isOpen}
          <div class="bg-canvas border-t border-dashed border-line-3 px-4 py-3 flex flex-col gap-2">
            <div class="grid gap-2.5 font-mono text-[11px] leading-[1.6]" style="grid-template-columns: 92px 1fr;">
              <span class="text-ink-3">{sv.transport === "http" ? "url" : "command"}</span>
              <span class="text-ink break-all">{sv.transport === "http" ? (sv.url || "—") : (sv.command || "—")}</span>
              {#if sv.args?.length}
                <span class="text-ink-3">args</span>
                <span class="text-ink break-all">{sv.args.join(" ")}</span>
              {/if}
              <span class="text-ink-3">scope</span>
              <span class="text-ink">{sv.scope}</span>
              {#if sv.overridden}
                <span class="text-ink-3">overridden</span>
                <span class="text-amber">shadowed by higher-priority scope</span>
              {/if}
              {#if Object.keys(sv.env ?? {}).length}
                <span class="text-ink-3">env</span>
                <span class="text-ink break-all">{JSON.stringify(sv.env)}</span>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="py-5 px-4 text-center text-ink-3 text-[12.5px]">No servers in this scope.</div>
    {/each}
  </div>
</div>

<div class="flex items-start gap-2 text-[12px] text-ink-2 leading-[1.5] px-1">
  <Icon name="info" size={14} class="text-ink-3 flex-none mt-[2px]" />
  MCP servers are configured in <code class="font-mono text-[11px]">mcp.json</code> at global, project, or local scope. Disabled servers stay configured but their tools are hidden from the engine.
</div>
