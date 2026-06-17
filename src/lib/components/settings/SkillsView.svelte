<!--
  SkillsView — list skills with scope filter tabs, inline enable/disable Switch,
  and add/remove. All changes persist via window.mineco.skills.*
-->
<script lang="ts">
import { i18n } from "../../stores/i18n.svelte";
import Icon from "../../ui/Icon.svelte";
import SwitchUI from "../../ui/Switch.svelte";
import { onMount } from "svelte";
import type { Skill } from "../../agent-protocol";

let skills = $state<Skill[]>([]);
let filter = $state<"all" | "global" | "project" | "local">("all");

const SCOPES = ["global", "project", "local"] as const;

onMount(async () => {
  skills = (await window.mineco.skills.list()) ?? [];
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

async function toggleSkill(id: string) {
  const idx = skills.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const updated = { ...skills[idx], enabled: !skills[idx].enabled };
  skills[idx] = updated;
  await window.mineco.skills.update(updated);
}

async function addSkill() {
  const created = await window.mineco.skills.create({
    name: "New skill",
    description: "",
    scope: "global",
    source: "local",
    enabled: false,
  });
  skills = [...skills, created];
}

async function removeSkill(id: string) {
  await window.mineco.skills.remove(id);
  skills = skills.filter((s) => s.id !== id);
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
    onclick={addSkill}
    class="mc-no-drag flex-none inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--r-field)] border border-line-3 bg-card-2 text-ink text-[12.5px] font-semibold hover:bg-raised transition-colors"
  >
    <Icon name="plus" size={13} />
    {i18n.t("add")} skill
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
    {#each shown as sk (sk.id)}
      <div class="flex items-center gap-3 px-4 py-3 border-t border-line first:border-t-0">
        <!-- icon badge -->
        <span class="w-[30px] h-[30px] flex-none rounded-[9px] border border-line bg-raised grid place-items-center text-accent-tx">
          <Icon name="skill" size={15} />
        </span>
        <span class="flex-1 min-w-0 flex flex-col">
          <span class="font-[650] text-[13px] text-ink">{sk.name}</span>
          <span class="font-mono text-[10.5px] text-ink-3 truncate">{sk.description}</span>
        </span>
        <!-- source tag -->
        <span class="font-mono text-[10px] text-ink-3 bg-card-2 border border-line px-2 py-[2px] rounded-full flex-none">{sk.source}</span>
        <!-- scope pill -->
        <span class="font-mono text-[9.5px] font-semibold tracking-widest uppercase px-[7px] py-[2px] rounded-full border flex-none {scopeClass(sk.scope)}">
          {i18n.t(`scope.${sk.scope}`)}
        </span>
        <!-- toggle -->
        <SwitchUI checked={sk.enabled} label={sk.enabled ? "Disable" : "Enable"} onCheckedChange={() => toggleSkill(sk.id)} />
        <!-- remove -->
        <button
          type="button"
          onclick={() => removeSkill(sk.id)}
          title={i18n.t("remove")}
          class="mc-no-drag w-[26px] h-[26px] flex-none border-none rounded-[7px] bg-transparent text-ink-3 cursor-pointer grid place-items-center hover:bg-raised hover:text-ink transition-colors"
        >
          <Icon name="trash" size={13} />
        </button>
      </div>
    {:else}
      <div class="py-5 px-4 text-center text-ink-3 text-[12.5px]">No skills in this scope.</div>
    {/each}
  </div>
</div>

<div class="flex items-start gap-2 text-[12px] text-ink-2 leading-[1.5] px-1">
  <Icon name="info" size={14} class="text-ink-3 flex-none mt-[2px]" />
  Scopes merge with precedence <strong class="text-ink-2">local &gt; project &gt; global</strong>. Enabled skills are invoked automatically when the engine hits a matching situation.
</div>
