<!--
  MemoryView — per-workspace memory CRUD. Workspace selector tabs from the
  workspace store. For each workspace shows editable memory entries with
  kind chips (fact/convention/preference — click cycles), auto-growing
  textareas, and delete. Persists all changes via window.mineco.memory.*
-->
<script lang="ts">
import { i18n } from "../../stores/i18n.svelte";
import Icon from "../../ui/Icon.svelte";
import { onMount } from "svelte";
import type { MemoryEntry } from "../../agent-protocol";
import { workspaces } from "../../stores/workspace.svelte";

// per-workspace entries, keyed by workspaceId
let entriesByWs = $state<Record<string, MemoryEntry[]>>({});
let selectedWsId = $state<string | null>(null);

// debounce for textarea updates
let debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

const MEM_KINDS = ["fact", "convention", "preference"] as const;
type MemKind = (typeof MEM_KINDS)[number];

function kindClass(kind: MemKind) {
  if (kind === "fact")
    return "text-[#6FB7D9] bg-[color-mix(in_oklab,#6FB7D9_14%,var(--card-2))] border-[color-mix(in_oklab,#6FB7D9_30%,transparent)]";
  if (kind === "convention")
    return "text-accent-tx bg-accent-bg border-accent-ln";
  return "text-[#C79BE6] bg-[color-mix(in_oklab,#C79BE6_14%,var(--card-2))] border-[color-mix(in_oklab,#C79BE6_30%,transparent)]";
}

onMount(async () => {
  await workspaces.load();
  if (workspaces.items.length > 0) {
    selectedWsId = workspaces.currentId ?? workspaces.items[0].id;
  }
  await loadEntries();
});

async function loadEntries() {
  // Load memory for all workspaces (including null for shared scratch)
  for (const ws of workspaces.items) {
    try {
      const entries = await window.mineco.memory.list(ws.id);
      entriesByWs[ws.id] = entries ?? [];
    } catch {
      entriesByWs[ws.id] = [];
    }
  }
}

const currentEntries = $derived(
  selectedWsId ? (entriesByWs[selectedWsId] ?? []) : [],
);

async function addEntry() {
  if (!selectedWsId) return;
  const entry = await window.mineco.memory.create({
    workspaceId: selectedWsId,
    kind: "fact",
    text: "",
  });
  entriesByWs[selectedWsId] = [...(entriesByWs[selectedWsId] ?? []), entry];
}

async function deleteEntry(id: string) {
  if (!selectedWsId) return;
  await window.mineco.memory.remove(id);
  entriesByWs[selectedWsId] = (entriesByWs[selectedWsId] ?? []).filter(
    (e) => e.id !== id,
  );
}

async function cycleKind(id: string) {
  if (!selectedWsId) return;
  const list = entriesByWs[selectedWsId] ?? [];
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return;
  const nextKind =
    MEM_KINDS[
      (MEM_KINDS.indexOf(list[idx].kind as MemKind) + 1) % MEM_KINDS.length
    ];
  const updated = { ...list[idx], kind: nextKind };
  list[idx] = updated;
  entriesByWs[selectedWsId] = [...list];
  await window.mineco.memory.update(updated);
}

function updateText(id: string, text: string) {
  if (!selectedWsId) return;
  const list = entriesByWs[selectedWsId] ?? [];
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return;
  const updated = { ...list[idx], text };
  list[idx] = updated;
  entriesByWs[selectedWsId] = [...list];
  if (debounceTimers[id]) clearTimeout(debounceTimers[id]);
  debounceTimers[id] = setTimeout(() => {
    window.mineco.memory.update(updated);
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

<div class="flex items-end gap-3">
  <div class="flex-1 min-w-0">
    <h1 class="m-0 font-bold text-[22px] leading-tight tracking-tight text-ink">
      {i18n.t("settings.memory")}
    </h1>
    <p class="mt-1.5 text-ink-2 text-[13.5px] leading-[1.55] max-w-[60ch]">
      Long-term memory mineco keeps <strong class="text-ink">per workspace</strong> — facts, conventions and preferences it injects at the start of each turn, carried across sessions.
    </p>
  </div>
  <button
    type="button"
    onclick={addEntry}
    disabled={!selectedWsId}
    class="mc-no-drag flex-none inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--r-field)] border border-line-3 bg-card-2 text-ink text-[12.5px] font-semibold hover:bg-raised transition-colors disabled:opacity-40"
  >
    <Icon name="plus" size={13} />
    {i18n.t("add")} memory
  </button>
</div>

<!-- Workspace selector tabs -->
{#if workspaces.items.length > 0}
  <div class="flex items-center gap-2.5 flex-wrap">
    <span class="font-mono text-[10px] font-semibold tracking-[.06em] uppercase text-ink-3">
      {i18n.t("workspace")}
    </span>
    <div class="flex gap-1.5 flex-wrap">
      {#each workspaces.items as ws (ws.id)}
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

  {#if selectedWsId}
    {@const ws = workspaces.items.find((w) => w.id === selectedWsId)}
    <div class="flex items-center gap-2 text-[12px] text-ink-3 -mt-2 ml-0.5">
      <Icon name="brain" size={13} class="text-ink-3 flex-none" />
      {currentEntries.length} {currentEntries.length === 1 ? "entry" : "entries"}
      {#if ws?.path}
        · <span class="font-mono">{ws.path}</span>
      {/if}
    </div>
  {/if}
{/if}

<div class="bg-card border border-line rounded-[var(--r-card)] overflow-hidden">
  <div class="flex flex-col">
    {#if !selectedWsId || workspaces.items.length === 0}
      <div class="py-5 px-4 text-center text-ink-3 text-[12.5px]">
        {i18n.t("empty.noWorkspaces")}
      </div>
    {:else if currentEntries.length === 0}
      <div class="py-5 px-4 text-center text-ink-3 text-[12.5px]">No memory yet for this workspace.</div>
    {:else}
      {#each currentEntries as entry (entry.id)}
        <div class="flex items-start gap-3 px-4 py-3 border-t border-line first:border-t-0">
          <!-- kind chip (click to cycle) -->
          <button
            type="button"
            title="Cycle kind"
            onclick={() => cycleKind(entry.id)}
            class="mc-no-drag flex-none cursor-pointer border font-mono text-[9.5px] font-semibold tracking-widest uppercase px-[9px] py-[3px] rounded-full mt-[5px] min-w-[84px] text-center transition-colors {kindClass(entry.kind as MemKind)}"
          >
            {entry.kind}
          </button>
          <!-- editable text -->
          <textarea
            value={entry.text}
            spellcheck="false"
            placeholder="Write a fact, convention or preference…"
            rows={1}
            oninput={(e) => {
              autoResize(e.target as HTMLTextAreaElement);
              updateText(entry.id, (e.target as HTMLTextAreaElement).value);
            }}
            use:resizeOnMount
            class="mc-no-drag flex-1 min-w-0 resize-none overflow-hidden border border-transparent bg-transparent outline-none text-ink font-ui text-[13px] leading-[1.55] px-2 py-[7px] rounded-[var(--r-field)] hover:bg-card-2 focus:bg-card-2 focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)] transition-all placeholder:text-ink-3"
          ></textarea>
          <!-- delete -->
          <button
            type="button"
            title={i18n.t("delete")}
            onclick={() => deleteEntry(entry.id)}
            class="mc-no-drag w-[26px] h-[26px] flex-none border-none rounded-[7px] bg-transparent text-ink-3 cursor-pointer grid place-items-center mt-[3px] hover:bg-[color-mix(in_oklab,var(--del)_15%,transparent)] hover:text-[var(--del)] transition-colors"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      {/each}
    {/if}
  </div>
</div>

<div class="flex items-start gap-2 text-[12px] text-ink-2 leading-[1.5] px-1">
  <Icon name="info" size={14} class="text-ink-3 flex-none mt-[2px]" />
  Injected to the engine when a turn starts. With no workspace selected, entries fall into the shared scratch directory.
</div>
