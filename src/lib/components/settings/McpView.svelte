<!--
  McpView — MCP servers list with scope filter, inline toggle, and expandable
  detail rows. Wires all CRUD to window.mineco.mcp.*
-->
<script lang="ts">
import { i18n } from "../../stores/i18n.svelte";
import Icon from "../../ui/Icon.svelte";
import SwitchUI from "../../ui/Switch.svelte";
import { onMount } from "svelte";
import type { McpServer } from "../../agent-protocol";

let servers = $state<McpServer[]>([]);
let openId = $state<string | null>(null);
let filter = $state<"all" | "global" | "project" | "local">("all");

const SCOPES = ["global", "project", "local"] as const;

onMount(async () => {
  servers = (await window.mineco.mcp.list()) ?? [];
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

async function toggleServer(id: string) {
  const idx = servers.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const updated = { ...servers[idx], enabled: !servers[idx].enabled };
  servers[idx] = updated;
  await window.mineco.mcp.update(updated);
}

async function addServer() {
  const created = await window.mineco.mcp.create({
    name: "New server",
    transport: "stdio",
    scope: "global",
    enabled: false,
    command: "",
    env: "{}",
  });
  servers = [...servers, created];
  openId = created.id;
}

async function removeServer(id: string) {
  await window.mineco.mcp.remove(id);
  servers = servers.filter((s) => s.id !== id);
  if (openId === id) openId = null;
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
      External tools the engine can call. {enabledCount} enabled.
    </p>
  </div>
  <button
    type="button"
    onclick={addServer}
    class="mc-no-drag flex-none inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--r-field)] border border-line-3 bg-card-2 text-ink text-[12.5px] font-semibold hover:bg-raised transition-colors"
  >
    <Icon name="plus" size={13} />
    Add server
  </button>
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
    {#each shown as sv (sv.id)}
      {@const isOpen = openId === sv.id}
      <!-- Row -->
      <div
        class="flex flex-col border-t border-line first:border-t-0"
      >
        <button
          type="button"
          onclick={() => (openId = isOpen ? null : sv.id)}
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
          <span onclick={(e) => { e.stopPropagation(); toggleServer(sv.id); }}>
            <SwitchUI checked={sv.enabled} label={sv.enabled ? "Disable" : "Enable"} onCheckedChange={() => toggleServer(sv.id)} />
          </span>
          <span class="text-ink-3 transition-transform {isOpen ? 'rotate-180' : ''}">
            <Icon name="chev" size={13} />
          </span>
        </button>

        <!-- Expanded detail -->
        {#if isOpen}
          <div class="bg-canvas border-t border-dashed border-line-3 px-4 py-3 flex flex-col gap-2">
            <div class="grid gap-2.5 font-mono text-[11px] leading-[1.6]" style="grid-template-columns: 92px 1fr;">
              <span class="text-ink-3">{sv.transport === "http" ? "endpoint" : "command"}</span>
              <span class="text-ink break-all">{sv.command || "—"}</span>
              <span class="text-ink-3">scope</span>
              <span class="text-ink">{sv.scope}</span>
              <span class="text-ink-3">env</span>
              <span class="text-ink break-all">{sv.env || "{}"}</span>
            </div>
            <div class="flex justify-end pt-1">
              <button
                type="button"
                onclick={() => removeServer(sv.id)}
                class="mc-no-drag inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-[7px] transition-colors"
                style="color: var(--del); background: color-mix(in oklab, var(--del) 10%, transparent); border: 1px solid color-mix(in oklab, var(--del) 30%, transparent);"
              >
                <Icon name="trash" size={12} />
                {i18n.t("remove")}
              </button>
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
  Scopes merge with precedence <strong class="text-ink-2">local &gt; project &gt; global</strong>. Disabled servers stay configured but their tools are hidden from the engine.
</div>
