<!--
  SkillsView — list skills with scope filter tabs, inline enable/disable Switch.
  Data is filesystem-backed (SkillEntry with scope/path/description). toggle()
  persists enable/disable. create() scaffolds a new skill directory.
-->
<script lang="ts">
import { i18n } from "../../stores/i18n.svelte";
import Icon from "../../ui/Icon.svelte";
import SwitchUI from "../../ui/Switch.svelte";
import { onMount } from "svelte";
import type { SkillEntry } from "../../agent-protocol";
import { workspaces } from "../../stores/workspace.svelte";

let skills = $state<SkillEntry[]>([]);
let filter = $state<"all" | "global" | "project" | "local">("all");
let creatingName = $state("");
let showCreate = $state(false);

const SCOPES = ["global", "project", "local"] as const;

onMount(async () => {
  skills =
    (await window.mineco.skills.list(workspaces.currentId ?? null)) ?? [];
});

const scopeCounts = $derived({
  all: skills.length,
  global: skills.filter((s) => s.scope === "global").length,
  project: skills.filter((s) => s.scope === "project").length,
  local: skills.filter((s) => s.scope === "local").length,
});

const shown = $derived(
  filter === "all" ? skills : skills.filter((s) => s.scope === filter),
);

const enabledCount = $derived(skills.filter((s) => s.enabled).length);

async function toggleSkill(name: string) {
  const idx = skills.findIndex((s) => s.name === name);
  if (idx === -1) return;
  const next = !skills[idx].enabled;
  skills[idx] = { ...skills[idx], enabled: next };
  await window.mineco.skills.toggle(name, next, workspaces.currentId ?? null);
}

async function createSkill() {
  const name = creatingName.trim();
  if (!name) return;
  try {
    const created = await window.mineco.skills.create(
      name,
      "global",
      workspaces.currentId ?? null,
    );
    skills = [...skills, created];
    showCreate = false;
    creatingName = "";
  } catch (e) {
    console.error("Failed to create skill:", e);
  }
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
      {i18n.t("settings.skills")}
    </h1>
    <p class="mt-1.5 text-ink-2 text-[13.5px] leading-[1.55] max-w-[60ch]">
      Capability packs the engine can call — instructions plus optional scripts. {enabledCount} of {skills.length} enabled.
    </p>
  </div>
  <button
    type="button"
    onclick={() => (showCreate = !showCreate)}
    class="mc-no-drag flex-none inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--r-field)] border border-line-3 bg-card-2 text-ink text-[12.5px] font-semibold hover:bg-raised transition-colors"
  >
    <Icon name="plus" size={13} />
    {i18n.t("add")} skill
  </button>
</div>

{#if showCreate}
  <div class="flex items-center gap-2 bg-card border border-line rounded-[var(--r-card)] px-4 py-3">
    <input
      type="text"
      bind:value={creatingName}
      placeholder="skill-name"
      class="flex-1 min-w-0 border border-line rounded-[var(--r-field)] bg-card-2 px-3 h-[34px] font-mono text-[12px] text-ink outline-none focus:border-accent"
    />
    <button
      type="button"
      onclick={createSkill}
      class="mc-no-drag inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-field)] border border-accent-ln bg-accent-bg text-accent-tx text-[12px] font-semibold cursor-pointer hover:bg-accent hover:text-white transition-colors"
    >
      Create
    </button>
    <button
      type="button"
      onclick={() => { showCreate = false; creatingName = ""; }}
      class="mc-no-drag text-ink-3 hover:text-ink transition-colors"
      aria-label="Cancel"
    >
      <Icon name="close" size={14} />
    </button>
  </div>
{/if}

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
    {#each shown as sk (sk.name + sk.scope)}
      <div class="flex items-center gap-3 px-4 py-3 border-t border-line first:border-t-0">
        <!-- icon badge -->
        <span class="w-[30px] h-[30px] flex-none rounded-[9px] border border-line bg-raised grid place-items-center text-accent-tx">
          <Icon name="skill" size={15} />
        </span>
        <span class="flex-1 min-w-0 flex flex-col">
          <span class="font-[650] text-[13px] text-ink">{sk.name}</span>
          <span class="font-mono text-[10.5px] text-ink-3 truncate">{sk.description || sk.path}</span>
        </span>
        {#if sk.overridden}
          <span class="font-mono text-[9.5px] text-amber">overridden</span>
        {/if}
        <!-- scope pill -->
        <span class="font-mono text-[9.5px] font-semibold tracking-widest uppercase px-[7px] py-[2px] rounded-full border flex-none {scopeClass(sk.scope)}">
          {i18n.t(`scope.${sk.scope}`)}
        </span>
        <!-- toggle -->
        <SwitchUI checked={sk.enabled} label={sk.enabled ? "Disable" : "Enable"} onCheckedChange={() => toggleSkill(sk.name)} />
      </div>
    {:else}
      <div class="py-5 px-4 text-center text-ink-3 text-[12.5px]">No skills in this scope.</div>
    {/each}
  </div>
</div>

<div class="flex items-start gap-2 text-[12px] text-ink-2 leading-[1.5] px-1">
  <Icon name="info" size={14} class="text-ink-3 flex-none mt-[2px]" />
  Skills live in <code class="font-mono text-[11px]">skills/</code> directories at global (<code class="font-mono text-[11px]">~/.mineco/</code>), project (<code class="font-mono text-[11px]">.claude/</code>), or local (<code class="font-mono text-[11px]">.mineco/</code>) scope. Scopes merge with precedence <strong class="text-ink-2">local &gt; project &gt; global</strong>.
</div>
