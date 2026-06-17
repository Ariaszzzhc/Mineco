<!--
  Composer — the shared composer used by both Home (new session) and Chat
  (session view). Layout mirrors the prototype: a scope+engine row of floating
  chips (workspace + branch on the left, agent + model on the right), a
  standalone input card with an inline return key, and a toolbar row with the
  run-mode pill, attach/dictate icon buttons, and a context-window ring.

  Enter sends; Shift+Enter newlines; Shift+Tab cycles run mode. The model menu
  is per-agent: it lists the four roles (sonnet/opus/fable/haiku) labelled with
  each role's configured model id (falling back to the role name); the selected
  value stays the role alias, which the adapter resolves to a concrete id (and
  1M suffix) via the agent's settings.json env. The ring reflects the latest
  turn's real context fill.
-->
<script lang="ts">
import { i18n } from "../../stores/i18n.svelte";
import Icon from "../../ui/Icon.svelte";
import Popover from "../../ui/Popover.svelte";
import type {
  Agent,
  AgentDetail,
  EngineId,
  NormalizedUsage,
  RunMode,
  Workspace,
} from "../../agent-protocol";
import { MODEL_ROLES } from "../../agent-protocol";
import { workspaces } from "../../stores/workspace.svelte";
import { onMount, tick } from "svelte";

let {
  agents,
  agentId = $bindable(),
  model = $bindable(),
  mode = $bindable(),
  value = $bindable(""),
  busy = false,
  usage = null,
  workspace = null,
  canSwitchWorkspace = false,
  onsend,
  onstop,
}: {
  agents: Agent[];
  agentId: string | null;
  model: string;
  mode: string;
  value?: string;
  busy?: boolean;
  usage?: NormalizedUsage | null;
  /** The workspace to display when read-only (Chat passes the session's). */
  workspace?: Workspace | null;
  /** Home: true → the chip is a switcher; Chat: false → read-only display. */
  canSwitchWorkspace?: boolean;
  onsend: (text: string) => void;
  onstop?: () => void;
} = $props();

let textareaEl = $state<HTMLTextAreaElement | null>(null);
let runModeList = $state<RunMode[]>([]);
/** Loaded detail for the selected agent — supplies the per-role model menu. */
let detail = $state<AgentDetail | null>(null);

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
 * Per-agent model options. The value stays the role alias
 * (sonnet/opus/fable/haiku) so the adapter resolves the concrete model id via
 * the agent's settings.json env; the label is the user's display name (which
 * defaults to the role id). Falls back to the bare role list before the
 * agent's detail loads.
 */
const models = $derived.by<ModelOpt[]>(() => {
  if (!curAgent) return [];
  const roles =
    detail && detail.id === curAgent.id ? detail.connection.roles : [];
  if (roles.length) {
    return roles.map((r) => {
      const wire = r.model ? (r.supports1M ? `${r.model} · 1M` : r.model) : "";
      return {
        id: r.role,
        nm: r.displayName || r.role,
        ds: wire,
      };
    });
  }
  return MODEL_ROLES.map((role) => ({ id: role, nm: role, ds: "" }));
});

// Load the selected agent's detail so the model menu can show display names.
$effect(() => {
  const id = agentId;
  if (!id) {
    detail = null;
    return;
  }
  void window.mineco.agents
    .get(id)
    .then((d) => {
      if (agentId === id) detail = d;
    })
    .catch(() => {});
});

/** Context-window fill (0–1) from the latest turn's usage, or null if unknown. */
const ctxPct = $derived.by<number | null>(() => {
  if (!usage?.contextTokens || !usage?.contextWindow) return null;
  return Math.min(1, usage.contextTokens / usage.contextWindow);
});

const curModel = $derived(
  models.find((m) => m.id === model) ?? models[0] ?? null,
);

// In Home the chip is a live switcher (tracks the global selection); in Chat it
// is a read-only mirror of the session's own workspace.
const displayWorkspace = $derived(
  canSwitchWorkspace ? workspaces.current : workspace,
);

// Real folder workspaces (the public/no-workspace sentinel has rootPath null
// and is offered separately as a dedicated "No workspace" option).
const recentWorkspaces = $derived(workspaces.items.filter((w) => w.rootPath));
/** The public/no-workspace sentinel row, if present. */
const publicWs = $derived(workspaces.items.find((w) => !w.rootPath) ?? null);
/** True when the active selection is the public/no-workspace space. */
const isNoWorkspace = $derived(!workspaces.current?.rootPath);

/** Label for a displayed workspace: its name, or "No workspace" when public. */
function wsLabel(ws: Workspace | null): string {
  return ws?.rootPath ? ws.name : i18n.t("workspace.none");
}

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

// ── textarea auto-size ──────────────────────────────────────────────────────
function autosize() {
  const el = textareaEl;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
}

$effect(() => {
  void value; // track
  autosize();
});

let wsOpen = $state(false);
let agentOpen = $state(false);
let modelOpen = $state(false);
let modeOpen = $state(false);

function submit() {
  const text = value.trim();
  if (!text || busy) return;
  onsend(text);
  value = "";
  void tick().then(autosize);
}

function cycleMode() {
  if (!runModeList.length) return;
  const i = runModeList.findIndex((m) => m.id === mode);
  mode = runModeList[(i + 1) % runModeList.length].id;
}

function onKeydown(e: KeyboardEvent) {
  // During IME composition (e.g. typing CJK pinyin) Enter confirms a candidate,
  // not sends. KeyboardEvent.isComposing is true throughout the composition
  // session, so guard the submit/cycle shortcuts on it.
  if (e.isComposing) return;
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

// Static per-mode style hints (purely cosmetic; unknown ids fall back).
const MODE_STYLE: Record<string, { color: string; icon: string }> = {
  default: { color: "#5566C9", icon: "sparkle" },
  plan: { color: "#C9890F", icon: "plan" },
  auto: { color: "#D9608C", icon: "bolt" },
  acceptEdits: { color: "#3E9B4F", icon: "shield" },
};
function modeStyle(id: string): { color: string; icon: string } {
  return MODE_STYLE[id] ?? { color: "#5566C9", icon: "sparkle" };
}

const curModeObj = $derived(runModeList.find((m) => m.id === mode) ?? null);
const curModeStyle = $derived(modeStyle(mode));

// ── workspace selection ─────────────────────────────────────────────────────
/** Select the public/no-workspace space (cwd resolves to ~/.mineco/public). */
function selectNoWorkspace() {
  workspaces.setCurrent(publicWs?.id ?? null);
  wsOpen = false;
}

async function pickWorkspace() {
  const path = await workspaces.pickDirectory();
  if (!path) return;
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  const name =
    parts.slice(-2).join("/") || parts[parts.length - 1] || "workspace";
  await workspaces.create({ name, rootPath: path });
}
</script>

<div class="flex w-full flex-col gap-[9px]">

  <!-- zone 1 — scope + engine row -->
  <div class="flex flex-nowrap items-center gap-2">
    {#if canSwitchWorkspace}
      <!-- New session, not started yet: choose the workspace this session will
           run in (defaults to the last-used one). -->
      <Popover bind:open={wsOpen} side="top" align="start" class="min-w-[240px]">
        {#snippet trigger()}
          <span
            class="mc-no-drag inline-flex h-7 cursor-pointer items-center gap-[6px] rounded-[8px] border border-line bg-card px-[10px] text-[12px] font-[500] text-ink transition-colors hover:border-line-3 hover:bg-card-2"
            title={i18n.t("workspace")}
          >
            <Icon name="folder" size={14} stroke={1.8} class="text-ink-2" />
            {wsLabel(workspaces.current)}
            <Icon name="chev" size={11} stroke={2.4} class="text-ink-3" />
          </span>
        {/snippet}
        {#if recentWorkspaces.length}
          <div class="px-2 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-ink-3">
            {i18n.t("nav.recent")}
          </div>
          {#each recentWorkspaces as w (w.id)}
            <button
              type="button"
              onclick={() => {
                workspaces.setCurrent(w.id);
                wsOpen = false;
              }}
              class="flex w-full items-center gap-2.5 rounded-[var(--r-field)] px-2 py-1.5 text-left outline-none hover:bg-card-2"
            >
              <span class="flex-1 truncate text-[13px] text-ink">{w.name}</span>
              {#if workspaces.currentId === w.id}
                <span class="flex-none text-accent-tx"><Icon name="check" size={14} stroke={2.4} /></span>
              {/if}
            </button>
          {/each}
          <div class="my-1 border-t border-line"></div>
        {/if}
        <!-- No workspace: runs in the public scratch dir (~/.mineco/public). -->
        <button
          type="button"
          onclick={selectNoWorkspace}
          class="flex w-full items-center gap-2.5 rounded-[var(--r-field)] px-2 py-1.5 text-left outline-none hover:bg-card-2"
        >
          <span class="flex-1 text-[13px] text-ink">{i18n.t("workspace.none")}</span>
          {#if isNoWorkspace}
            <span class="flex-none text-accent-tx"><Icon name="check" size={14} stroke={2.4} /></span>
          {/if}
        </button>
        <button
          type="button"
          onclick={() => {
            wsOpen = false;
            void pickWorkspace();
          }}
          class="flex w-full items-center rounded-[var(--r-field)] px-2 py-1.5 text-left outline-none hover:bg-card-2"
        >
          <span class="text-[13px] text-ink">{i18n.t("workspace.openFolder")}</span>
        </button>
      </Popover>
    {:else}
      <!-- Session started: workspace is locked. A non-interactive ghost chip
           that simply reports which directory this session runs in. -->
      <span
        class="inline-flex h-7 items-center gap-[6px] rounded-[8px] bg-chrome-2 px-[10px] text-[12px] font-[500] text-ink-2"
        title={displayWorkspace?.rootPath ?? i18n.t("workspace.none")}
      >
        <Icon name="folder" size={14} stroke={1.8} class="text-ink-3" />
        {wsLabel(displayWorkspace)}
      </span>
    {/if}
    {#if displayWorkspace?.rootPath}
      <span
        class={`inline-flex h-7 items-center gap-[6px] rounded-[8px] px-[10px] text-[12px] font-[500] ${
          canSwitchWorkspace
            ? "border border-line bg-card text-ink"
            : "bg-chrome-2 text-ink-2"
        }`}
      >
        <Icon name="git" size={13} stroke={1.8} class={canSwitchWorkspace ? "text-ink-2" : "text-ink-3"} />
        main
      </span>
    {/if}

    <span class="flex-1"></span>

    {#if curAgent}
      <Popover bind:open={agentOpen} side="top" align="end" class="min-w-[240px]">
        {#snippet trigger()}
          <span
            class="mc-no-drag inline-flex h-7 cursor-pointer items-center gap-[7px] rounded-[8px] border border-line bg-card pl-[5px] pr-[9px] text-[12px] font-semibold text-ink transition-colors hover:border-line-3 hover:bg-card-2"
            title={i18n.t("agent")}
          >
            <img class="size-[18px] flex-none rounded-[5px]" src={agentIcon(curAgent)} alt="" />
            {curAgent.name}
            <Icon name="chev" size={11} stroke={2.4} class="text-ink-3" />
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
      <Popover bind:open={modelOpen} side="top" align="end" class="min-w-[230px]">
        {#snippet trigger()}
          <span
            class="mc-no-drag inline-flex h-7 cursor-pointer items-center gap-[6px] rounded-[8px] border border-line bg-card px-[10px] text-[12px] font-semibold text-ink transition-colors hover:border-line-3 hover:bg-card-2"
            title={i18n.t("model")}
          >
            {curModel.nm}
            <Icon name="chev" size={11} stroke={2.4} class="text-ink-3" />
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

  <!-- zone 2 — input card + return -->
  <div
    class="flex items-end gap-2 rounded-[var(--r-panel)] border border-line-3 bg-card px-[17px] py-[6px] pr-[11px] shadow-[0_10px_30px_-20px_rgba(48,42,28,.5),0_1px_2px_rgba(48,42,28,.04)] transition-[border-color,box-shadow] focus-within:border-accent-ln focus-within:shadow-[0_12px_30px_-18px_rgba(48,42,28,.4),0_0_0_3px_var(--accent-bg)]"
  >
    <textarea
      bind:this={textareaEl}
      bind:value
      onkeydown={onKeydown}
      rows={1}
      aria-label={i18n.t("composer.placeholder")}
      class="mc-no-drag mc-scroll min-h-[46px] max-h-[220px] min-w-0 flex-1 resize-none border-none bg-transparent py-[10px] pb-[9px] text-[14.5px] leading-[1.5] text-ink outline-none placeholder:text-ink-3"
    ></textarea>

    {#if busy}
      <button
        type="button"
        onclick={onstop}
        title={i18n.t("stop")}
        aria-label={i18n.t("stop")}
        class="mc-no-drag mb-[6px] grid size-[34px] flex-none cursor-pointer place-items-center rounded-[9px] border border-line-2 bg-chrome-2 text-ink-2 outline-none transition-colors hover:text-ink"
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
        class={`mc-no-drag mb-[6px] grid size-[34px] flex-none cursor-pointer place-items-center rounded-[9px] border border-transparent outline-none transition-[background-color,color,border-color,transform,filter] active:translate-y-px disabled:opacity-50 ${
          hot
            ? "bg-accent text-white hover:brightness-108"
            : "bg-transparent text-ink-3 hover:bg-card-2 hover:text-ink"
        }`}
      >
        <!-- return arrow icon -->
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 10l-4 4 4 4" /><path d="M5 14h11a4 4 0 0 0 4-4V6" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- zone 3 — toolbar: run mode + tools + context ring -->
  <div class="flex items-center gap-[7px] px-0.5">
    <Popover bind:open={modeOpen} side="top" align="start" class="min-w-[240px]">
      {#snippet trigger()}
        <span
          class="mc-no-drag inline-flex h-[28px] cursor-pointer items-center gap-[5px] rounded-[8px] px-[10px] text-[11.5px] font-semibold outline-none transition-[filter] hover:brightness-95"
          style={`color:${curModeStyle.color};background:color-mix(in oklab, ${curModeStyle.color} 14%, transparent)`}
          title={i18n.t("runMode")}
        >
          <Icon name={curModeStyle.icon} size={13} stroke={1.8} />
          {curModeObj?.label ?? mode}
          <Icon name="chev" size={11} stroke={2.4} class="opacity-85" />
        </span>
      {/snippet}
      <div class="px-2 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-ink-3">
        {i18n.t("runMode")}
      </div>
      {#each runModeList as m (m.id)}
        {@const ms = modeStyle(m.id)}
        <button
          type="button"
          onclick={() => {
            mode = m.id;
            modeOpen = false;
          }}
          class="flex w-full items-center gap-2.5 rounded-[var(--r-field)] px-2 py-1.5 text-left outline-none hover:bg-card-2"
        >
          <span
            class="grid size-[26px] flex-none place-items-center rounded-[7px]"
            style:background={`color-mix(in oklab, ${ms.color} 16%, var(--card-2))`}
            style:color={ms.color}
          >
            <Icon name={ms.icon} size={14} />
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
      class="mc-no-drag grid size-[31px] cursor-pointer place-items-center rounded-[8px] text-ink-2 outline-none transition-colors hover:bg-card-2 hover:text-ink"
    >
      <Icon name="attach" size={17} stroke={1.8} />
    </button>
    <button
      type="button"
      title="Dictate"
      aria-label="Dictate"
      class="mc-no-drag grid size-[31px] cursor-pointer place-items-center rounded-[8px] text-ink-2 outline-none transition-colors hover:bg-card-2 hover:text-ink"
    >
      <Icon name="mic" size={16} stroke={1.8} />
    </button>

    <span class="flex-1"></span>

    <!-- context window fill (from the latest turn's usage) -->
    <span
      class="inline-flex h-[31px] items-center gap-[6px] rounded-[8px] px-2 font-mono text-[11.5px] text-ink-2"
      title={ctxPct !== null && usage
        ? `Context: ${usage.contextTokens?.toLocaleString()} / ${usage.contextWindow?.toLocaleString()} tokens`
        : "Context window — sends a turn to measure"}
    >
      <svg class="shrink-0" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.4" stroke="var(--line-3)" stroke-width="2.4" />
        {#if ctxPct !== null}
          <circle
            cx="8"
            cy="8"
            r="6.4"
            stroke="var(--accent)"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-dasharray={2 * Math.PI * 6.4}
            stroke-dashoffset={2 * Math.PI * 6.4 * (1 - ctxPct)}
            transform="rotate(-90 8 8)"
          />
        {/if}
      </svg>
      {ctxPct !== null ? `${Math.round(ctxPct * 100)}%` : "—"}
    </span>
  </div>
</div>
