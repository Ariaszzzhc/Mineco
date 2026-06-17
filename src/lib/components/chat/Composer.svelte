<!--
  Composer — the floating bottom dock. Mirrors the prototype's LqgComposer6:
  scope chips (workspace + branch), a connected AGENT + MODEL segmented pair,
  a textarea with an inline return key, and a footer with the RUN MODE selector,
  attach/dictate icon buttons, and a cosmetic context ring.

  Enter sends; Shift+Enter newlines; Shift+Tab cycles run mode. The model
  catalog is per-agent: Claude resolves sonnet/opus/haiku alias from the agent's
  settings (stored in configDir/settings.json). We pass the alias as `model`
  and let the adapter map it to a concrete id.
-->
<script lang="ts">
import { i18n } from "../../stores/i18n.svelte";
import Icon from "../../ui/Icon.svelte";
import Popover from "../../ui/Popover.svelte";
import type { Agent, EngineId, RunMode } from "../../agent-protocol";
import { workspaces } from "../../stores/workspace.svelte";
import { onMount } from "svelte";

let {
  agents,
  agentId = $bindable(),
  model = $bindable(),
  mode = $bindable(),
  busy = false,
  onsend,
  onstop,
}: {
  agents: Agent[];
  agentId: string | null;
  model: string;
  mode: string;
  busy?: boolean;
  onsend: (text: string) => void;
  onstop: () => void;
} = $props();

let value = $state("");
let runModeList = $state<RunMode[]>([]);

const curAgent = $derived(
  agents.find((a) => a.id === agentId) ?? agents[0] ?? null,
);
const engine = $derived<EngineId>(curAgent?.engine ?? "claude");

interface ModelOpt {
  id: string;
  nm: string;
  ds: string;
}

/**
 * Per-agent model options. For Claude, we offer the three alias ids
 * (sonnet/opus/haiku) — the adapter maps them to concrete model ids via the
 * agent's settings.json env. We use alias ids as the value so `model` carries
 * a stable alias regardless of how the user reconfigures concrete models.
 */
const models = $derived.by<ModelOpt[]>(() => {
  if (!curAgent) return [];
  // v1 is Claude-only; offer the three standard aliases.
  return [
    { id: "sonnet", nm: "Sonnet", ds: "Balanced default" },
    { id: "opus", nm: "Opus", ds: "Highest capability" },
    { id: "haiku", nm: "Haiku", ds: "Fastest, lowest cost" },
  ];
});

const curModel = $derived(
  models.find((m) => m.id === model) ?? models[0] ?? null,
);

const curWorkspace = $derived(workspaces.current);

// Load capabilities once when the engine changes.
$effect(() => {
  void engine; // track
  const api = (
    globalThis as {
      mineco?: {
        capabilities?: (e: EngineId) => Promise<{ modes: RunMode[] }>;
      };
    }
  ).mineco;
  if (!api?.capabilities) {
    runModeList = [
      { id: "default", label: "Default", description: "" },
      { id: "plan", label: "Plan", description: "" },
      { id: "auto", label: "Auto", description: "" },
    ];
    return;
  }
  api
    .capabilities(engine)
    .then((caps) => {
      if (caps?.modes?.length) runModeList = caps.modes;
    })
    .catch(() => {});
});

// keep model valid when the agent / its catalog changes
$effect(() => {
  if (models.length && !models.some((m) => m.id === model)) {
    model = models[0].id;
  }
});
// keep mode valid for the engine
$effect(() => {
  if (runModeList.length && !runModeList.some((m) => m.id === mode)) {
    mode = runModeList[0].id;
  }
});

// Initialise model alias on first mount if empty
onMount(() => {
  if (!model && models.length) {
    model = models[0].id;
  }
  if (!mode) mode = "default";
});

let agentOpen = $state(false);
let modelOpen = $state(false);
let modeOpen = $state(false);

function submit() {
  const text = value.trim();
  if (!text || busy) return;
  onsend(text);
  value = "";
}

function cycleMode() {
  if (!runModeList.length) return;
  const i = runModeList.findIndex((m) => m.id === mode);
  mode = runModeList[(i + 1) % runModeList.length].id;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
  if (e.key === "Tab" && e.shiftKey) {
    e.preventDefault();
    cycleMode();
  }
}

const hot = $derived(value.trim().length > 0 && !busy);

function agentIcon(_a: Agent): string {
  return "/brand/claude-icon.png";
}

const curModeObj = $derived(runModeList.find((m) => m.id === mode) ?? null);

function modeIcon(id: string): string {
  const map: Record<string, string> = {
    plan: "list",
    auto: "bolt",
    acceptEdits: "shield",
    default: "sparkle",
  };
  return map[id] ?? "sparkle";
}
</script>

<div class="rounded-[var(--r-panel)] border border-line-3 bg-chrome shadow-[0_24px_60px_-24px_rgba(0,0,0,.6)]">
  <!-- zone 1 — scope + engine pair -->
  <div class="flex flex-wrap items-center gap-1.5 border-b border-line-2 px-3 py-2">
    <span
      class="inline-flex items-center gap-1.5 rounded-[var(--r-field)] border border-line-2 bg-chrome-2 px-2 py-1 text-[11.5px] text-ink-2"
    >
      <Icon name="folder" size={12.5} />
      {curWorkspace?.name ?? i18n.t("workspace.shared")}
    </span>
    {#if curWorkspace?.rootPath}
      <span class="h-3 w-px bg-line-2"></span>
      <span
        class="inline-flex items-center gap-1.5 rounded-[var(--r-field)] border border-line-2 bg-chrome-2 px-2 py-1 text-[11.5px] text-ink-2"
      >
        <Icon name="git" size={12} />
        main
      </span>
    {/if}

    <span class="ml-auto"></span>

    <!-- connected agent + model pair -->
    <div class="inline-flex items-stretch overflow-hidden rounded-[var(--r-field)] border border-line-2">
      {#if curAgent}
        <Popover bind:open={agentOpen} side="top" align="end" class="min-w-[240px]">
          {#snippet trigger()}
            <span
              class="mc-no-drag inline-flex items-center gap-1.5 bg-chrome-2 px-2 py-1 text-[11.5px] text-ink-2 hover:text-ink"
              title="Agent"
            >
              <img class="size-3.5 rounded" src={agentIcon(curAgent)} alt="" />
              {curAgent.name}
              <Icon name="chev" size={11} />
            </span>
          {/snippet}
          <div class="px-2 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-ink-3">
            {i18n.t("agent")}
          </div>
          {#each agents as a (a.id)}
            <button
              type="button"
              onclick={() => {
                agentId = a.id;
                agentOpen = false;
              }}
              class="flex w-full items-center gap-2.5 rounded-[var(--r-field)] px-2 py-1.5 text-left outline-none hover:bg-card-2"
            >
              <img class="size-4 flex-none rounded" src={agentIcon(a)} alt="" />
              <span class="flex min-w-0 flex-col">
                <span class="truncate text-[13px] text-ink">{a.name}</span>
                <span class="truncate text-[11px] text-ink-3">Claude Code</span>
              </span>
              {#if a.id === (agentId ?? curAgent.id)}
                <span class="ml-auto text-accent-tx"><Icon name="check" size={13} stroke={2.4} /></span>
              {/if}
            </button>
          {/each}
        </Popover>
      {/if}

      {#if curModel}
        <span class="w-px self-stretch bg-line-2"></span>
        <Popover bind:open={modelOpen} side="top" align="end" class="min-w-[230px]">
          {#snippet trigger()}
            <span
              class="mc-no-drag inline-flex items-center gap-1.5 bg-chrome-2 px-2 py-1 text-[11.5px] text-ink-2 hover:text-ink"
              title="Model"
            >
              {curModel.nm}
              <Icon name="chev" size={11} />
            </span>
          {/snippet}
          <div class="px-2 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-ink-3">
            {i18n.t("model")}
          </div>
          {#each models as m (m.id)}
            <button
              type="button"
              onclick={() => {
                model = m.id;
                modelOpen = false;
              }}
              class="flex w-full items-center gap-2.5 rounded-[var(--r-field)] px-2 py-1.5 text-left outline-none hover:bg-card-2"
            >
              <span class="flex min-w-0 flex-col">
                <span class="truncate text-[13px] text-ink">{m.nm}</span>
                <span class="truncate text-[11px] text-ink-3">{m.ds}</span>
              </span>
              {#if m.id === curModel.id}
                <span class="ml-auto text-accent-tx"><Icon name="check" size={13} stroke={2.4} /></span>
              {/if}
            </button>
          {/each}
        </Popover>
      {/if}
    </div>
  </div>

  <!-- zone 2 — input + return -->
  <div class="flex items-end gap-2 px-3 py-2.5">
    <textarea
      rows="1"
      bind:value
      onkeydown={onKeydown}
      placeholder={i18n.t("composer.placeholder")}
      class="mc-no-drag mc-scroll max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-[14px] leading-[1.5] text-ink outline-none placeholder:text-ink-3"
      aria-label={i18n.t("composer.placeholder")}
    ></textarea>
    {#if busy}
      <button
        type="button"
        onclick={onstop}
        title={i18n.t("stop")}
        aria-label={i18n.t("stop")}
        class="mc-no-drag grid size-8 flex-none place-items-center rounded-[var(--r-field)] border border-line-2 bg-chrome-2 text-ink-2 outline-none hover:text-ink"
      >
        <span class="size-2.5 rounded-[2px] bg-del"></span>
      </button>
    {:else}
      <button
        type="button"
        onclick={submit}
        disabled={!hot}
        title="Send · ↩"
        aria-label={i18n.t("send")}
        class="mc-no-drag grid size-8 flex-none place-items-center rounded-[var(--r-field)] outline-none transition-colors disabled:opacity-40 {hot
          ? 'bg-accent text-white'
          : 'border border-line-2 bg-chrome-2 text-ink-3'}"
      >
        <Icon name="send" size={16} />
      </button>
    {/if}
  </div>

  <!-- zone 3 — footer: run mode + tools + context ring -->
  <div class="flex items-center gap-1.5 border-t border-line-2 px-3 py-2">
    <Popover bind:open={modeOpen} side="top" align="start" class="min-w-[240px]">
      {#snippet trigger()}
        <span
          class="mc-no-drag inline-flex items-center gap-1.5 rounded-[var(--r-field)] border border-accent-ln bg-accent-bg px-2 py-1 text-[11.5px] font-medium text-accent-tx"
          title={i18n.t("runMode")}
        >
          <Icon name={modeIcon(mode)} size={12} />
          {curModeObj?.label ?? mode}
          <Icon name="chev" size={11} />
        </span>
      {/snippet}
      <div class="px-2 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-ink-3">
        {i18n.t("runMode")}
      </div>
      {#each runModeList as m (m.id)}
        <button
          type="button"
          onclick={() => {
            mode = m.id;
            modeOpen = false;
          }}
          class="flex w-full items-center gap-2.5 rounded-[var(--r-field)] px-2 py-1.5 text-left outline-none hover:bg-card-2"
        >
          <span class="flex-none text-ink-2">
            <Icon name={modeIcon(m.id)} size={14} />
          </span>
          <span class="flex min-w-0 flex-col">
            <span class="text-[13px] text-ink">{m.label}</span>
            {#if m.description}
              <span class="text-[11px] text-ink-3">{m.description}</span>
            {/if}
          </span>
          {#if m.id === mode}
            <span class="ml-auto text-accent-tx"><Icon name="check" size={13} stroke={2.4} /></span>
          {/if}
        </button>
      {/each}
      <div class="px-2 pb-1.5 pt-1 text-[10.5px] text-ink-3">⇧⇥ cycles modes</div>
    </Popover>

    <button
      type="button"
      title="Attach files"
      aria-label="Attach files"
      class="mc-no-drag grid size-7 place-items-center rounded-[var(--r-field)] text-ink-3 outline-none hover:bg-chrome-2 hover:text-ink-2"
    >
      <Icon name="attach" size={16} />
    </button>
    <button
      type="button"
      title="Dictate"
      aria-label="Dictate"
      class="mc-no-drag grid size-7 place-items-center rounded-[var(--r-field)] text-ink-3 outline-none hover:bg-chrome-2 hover:text-ink-2"
    >
      <Icon name="mic" size={16} />
    </button>

    <span class="flex-1"></span>

    <!-- cosmetic context ring -->
    <span
      class="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-3"
      title="Context window"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="var(--line-3)" stroke-width="2.5" />
        <circle
          cx="8"
          cy="8"
          r="6.5"
          stroke="var(--accent)"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-dasharray={2 * Math.PI * 6.5}
          stroke-dashoffset={2 * Math.PI * 6.5 * (1 - 0.12)}
          transform="rotate(-90 8 8)"
        />
      </svg>
      12%
    </span>
  </div>
</div>
