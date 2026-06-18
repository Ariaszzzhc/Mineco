<!--
  MemoryView — per-workspace memory CRUD. Each memory entry is a markdown file
  with slug/title/description/type/body. Type is user|feedback|project|reference.
  Workspace selector tabs from the workspace store. All changes persist via
  window.mineco.memory.*
-->
<script lang="ts">
import { i18n } from "@/renderer/lib/stores/i18n.svelte";
import Icon from "@/renderer/lib/ui/Icon.svelte";
import Card from "@/renderer/lib/ui/Card.svelte";
import SettingsHeader from "@/renderer/lib/ui/SettingsHeader.svelte";
import { onMount } from "svelte";
import type { MemoryEntry } from "@/shared/agent-protocol";
import { workspaces } from "@/renderer/lib/stores/workspace.svelte";

// per-workspace entries, keyed by workspaceId (null = public/shared)
let entriesByWs = $state<Record<string, MemoryEntry[]>>({});
let selectedWsId = $state<string | null>(null);

const MEM_TYPES = ["user", "feedback", "project", "reference"] as const;
type MemType = (typeof MEM_TYPES)[number];

// debounce for textarea updates
let debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function typeClass(type: MemType) {
  if (type === "project") return "text-accent-tx bg-accent-bg border-accent-ln";
  if (type === "feedback")
    return "text-[#C79BE6] bg-[color-mix(in_oklab,#C79BE6_14%,var(--card-2))] border-[color-mix(in_oklab,#C79BE6_30%,transparent)]";
  if (type === "reference")
    return "text-amber bg-amber-bg border-[color-mix(in_oklab,var(--amber)_34%,transparent)]";
  return "text-[#6FB7D9] bg-[color-mix(in_oklab,#6FB7D9_14%,var(--card-2))] border-[color-mix(in_oklab,#6FB7D9_30%,transparent)]";
}

/** Normalized workspace key (null -> "null"). */
function wsKey(id: string | null): string {
  return id ?? "null";
}

onMount(async () => {
  await workspaces.load();
  selectedWsId = workspaces.currentId ?? null;
  await loadEntries();
});

async function loadEntries() {
  // Load memory for the public space + all workspaces
  const wsIds: Array<string | null> = [
    null,
    ...workspaces.items.map((w) => w.id),
  ];
  for (const id of wsIds) {
    try {
      const entries = await window.mineco.memory.list(id);
      entriesByWs[wsKey(id)] = entries ?? [];
    } catch {
      entriesByWs[wsKey(id)] = [];
    }
  }
}

const currentEntries = $derived(entriesByWs[wsKey(selectedWsId)] ?? []);

async function addEntry() {
  const entry: Omit<MemoryEntry, "slug"> = {
    title: "New memory",
    description: "",
    type: "user",
    body: "",
  };
  try {
    const created = await window.mineco.memory.create(selectedWsId, entry);
    const key = wsKey(selectedWsId);
    entriesByWs[key] = [...(entriesByWs[key] ?? []), created];
  } catch (e) {
    console.error("Failed to create memory entry:", e);
  }
}

async function deleteEntry(slug: string) {
  try {
    await window.mineco.memory.remove(selectedWsId, slug);
    const key = wsKey(selectedWsId);
    entriesByWs[key] = (entriesByWs[key] ?? []).filter((e) => e.slug !== slug);
  } catch (e) {
    console.error("Failed to delete memory entry:", e);
  }
}

async function cycleType(slug: string) {
  const key = wsKey(selectedWsId);
  const list = entriesByWs[key] ?? [];
  const idx = list.findIndex((e) => e.slug === slug);
  if (idx === -1) return;
  const nextType =
    MEM_TYPES[
      (MEM_TYPES.indexOf(list[idx].type as MemType) + 1) % MEM_TYPES.length
    ];
  const updated = { ...list[idx], type: nextType };
  list[idx] = updated;
  entriesByWs[key] = [...list];
  await window.mineco.memory.update(selectedWsId, updated);
}

function updateTitle(slug: string, title: string) {
  const key = wsKey(selectedWsId);
  const list = entriesByWs[key] ?? [];
  const idx = list.findIndex((e) => e.slug === slug);
  if (idx === -1) return;
  const updated = { ...list[idx], title };
  list[idx] = updated;
  entriesByWs[key] = [...list];
  if (debounceTimers[slug]) clearTimeout(debounceTimers[slug]);
  debounceTimers[slug] = setTimeout(() => {
    window.mineco.memory.update(selectedWsId, updated).catch(() => {});
  }, 400);
}

function updateBody(slug: string, body: string) {
  const key = wsKey(selectedWsId);
  const list = entriesByWs[key] ?? [];
  const idx = list.findIndex((e) => e.slug === slug);
  if (idx === -1) return;
  const updated = { ...list[idx], body };
  list[idx] = updated;
  entriesByWs[key] = [...list];
  const k2 = `${slug}-body`;
  if (debounceTimers[k2]) clearTimeout(debounceTimers[k2]);
  debounceTimers[k2] = setTimeout(() => {
    window.mineco.memory.update(selectedWsId, updated).catch(() => {});
  }, 400);
}

// auto-resize textarea helper (used inline in oninput)
function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

// Svelte action for initial auto-resize on mount
function resizeOnMount(el: HTMLTextAreaElement) {
  autoResize(el);
  return {};
}
</script>

<SettingsHeader title={i18n.t("settings.memory")}>
  {#snippet desc()}
    Long-term memory mineco keeps <strong class="text-ink">per workspace</strong> — facts, conventions and references injected at the start of each turn.
  {/snippet}
  {#snippet actions()}
    <button
      type="button"
      onclick={addEntry}
      class="mc-no-drag flex-none inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--r-field)] border border-line-3 bg-card-2 text-ink text-[12.5px] font-semibold hover:bg-raised transition-colors"
    >
      <Icon name="plus" size={13} />
      {i18n.t("add")} memory
    </button>
  {/snippet}
</SettingsHeader>

<!-- Workspace selector tabs -->
<div class="flex items-center gap-2.5 flex-wrap">
  <span class="font-mono text-[10px] font-semibold tracking-[.06em] uppercase text-ink-3">
    {i18n.t("workspace")}
  </span>
  <div class="flex gap-1.5 flex-wrap">
    <!-- No workspace (global memory at ~/.mineco/memory) -->
    <button
      type="button"
      onclick={() => (selectedWsId = null)}
      class="mc-no-drag cursor-pointer border rounded-full px-3.5 py-1.5 font-ui font-semibold text-[12.5px] transition-colors {selectedWsId === null
        ? 'bg-accent-bg text-accent-tx border-accent-ln'
        : 'border-line bg-card text-ink-2 hover:bg-card-2 hover:text-ink'}"
    >
      {i18n.t("workspace.none")}
    </button>
    {#each workspaces.items.filter((w) => w.rootPath) as ws (ws.id)}
      <button
        type="button"
        onclick={() => (selectedWsId = ws.id)}
        class="mc-no-drag cursor-pointer border rounded-full px-3.5 py-1.5 font-ui font-semibold text-[12.5px] transition-colors {selectedWsId === ws.id
          ? 'bg-accent-bg text-accent-tx border-accent-ln'
          : 'border-line bg-card text-ink-2 hover:bg-card-2 hover:text-ink'}"
      >
        {ws.name}
      </button>
    {/each}
  </div>
</div>

<div class="flex items-center gap-2 text-[12px] text-ink-3 -mt-2 ml-0.5">
  <Icon name="brain" size={13} class="text-ink-3 flex-none" />
  {currentEntries.length} {currentEntries.length === 1 ? "entry" : "entries"}
  {#if selectedWsId && workspaces.items.find((w) => w.id === selectedWsId)?.rootPath}
    · <span class="font-mono">{workspaces.items.find((w) => w.id === selectedWsId)?.rootPath}</span>
  {/if}
</div>

<Card>
  <div class="flex flex-col">
    {#if currentEntries.length === 0}
      <div class="py-5 px-4 text-center text-ink-3 text-[12.5px]">No memory yet for this workspace.</div>
    {:else}
      {#each currentEntries as entry (entry.slug)}
        <div class="flex flex-col gap-2 px-4 py-3 border-t border-line first:border-t-0">
          <!-- header row: type chip + title + delete -->
          <div class="flex items-start gap-3">
            <!-- type chip (click to cycle) -->
            <button
              type="button"
              title="Cycle type"
              onclick={() => cycleType(entry.slug)}
              class="mc-no-drag flex-none cursor-pointer border font-mono text-[9.5px] font-semibold tracking-widest uppercase px-[9px] py-[3px] rounded-full mt-[1px] min-w-[80px] text-center transition-colors {typeClass(entry.type as MemType)}"
            >
              {entry.type}
            </button>
            <!-- title -->
            <input
              type="text"
              value={entry.title}
              placeholder="Title…"
              spellcheck="false"
              oninput={(e) => updateTitle(entry.slug, (e.target as HTMLInputElement).value)}
              class="mc-no-drag flex-1 min-w-0 border border-transparent bg-transparent outline-none text-ink font-ui font-semibold text-[13px] px-2 py-[5px] rounded-[var(--r-field)] hover:bg-card-2 focus:bg-card-2 focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)] transition-all"
            />
            <!-- delete -->
            <button
              type="button"
              title={i18n.t("delete")}
              onclick={() => deleteEntry(entry.slug)}
              class="mc-no-drag w-[26px] h-[26px] flex-none border-none rounded-[7px] bg-transparent text-ink-3 cursor-pointer grid place-items-center hover:bg-[color-mix(in_oklab,var(--del)_15%,transparent)] hover:text-[var(--del)] transition-colors"
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
          <!-- body textarea -->
          <textarea
            value={entry.body}
            spellcheck="false"
            placeholder="Markdown body…"
            rows={1}
            oninput={(e) => {
              autoResize(e.target as HTMLTextAreaElement);
              updateBody(entry.slug, (e.target as HTMLTextAreaElement).value);
            }}
            use:resizeOnMount
            class="mc-no-drag w-full min-w-0 resize-none overflow-hidden border border-transparent bg-transparent outline-none text-ink font-mono text-[12px] leading-[1.6] px-2 py-[7px] rounded-[var(--r-field)] hover:bg-card-2 focus:bg-card-2 focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)] transition-all placeholder:text-ink-3"
          ></textarea>
        </div>
      {/each}
    {/if}
  </div>
</Card>

<div class="flex items-start gap-2 text-[12px] text-ink-2 leading-[1.5] px-1">
  <Icon name="info" size={14} class="text-ink-3 flex-none mt-[2px]" />
  Injected to the engine when a turn starts. Memory files live in <code class="font-mono text-[11px]">~/.mineco/memory/</code> (shared) or <code class="font-mono text-[11px]">&lt;workspace&gt;/.mineco/memory/</code> (per-workspace).
</div>
