<!--
  Home.svelte — the new-session / landing screen.
  Layout: custom titlebar + left sidebar + centered hero composer.

  On submit: creates a session, stashes the prompt via nav.pendingPrompt, then
  routes to nav.openSession(id). Empty input just refocuses the textarea.

  Persist last-used agent id and run mode per workspace in localStorage.
-->
<script lang="ts">
import { i18n } from "../stores/i18n.svelte";
import Icon from "../ui/Icon.svelte";
import AgentPicker from "../components/home/AgentPicker.svelte";
import RecentSessions from "../components/home/RecentSessions.svelte";
import RunModePicker from "../components/home/RunModePicker.svelte";
import WorkspaceSwitcher from "../components/home/WorkspaceSwitcher.svelte";
import { onMount, tick } from "svelte";
import type { Agent, RunMode } from "../agent-protocol";
import { nav } from "../stores/nav.svelte";
import { workspaces } from "../stores/workspace.svelte";

// ── agents ────────────────────────────────────────────────────────────────────
let agents = $state<Agent[]>([]);
let selectedAgent = $state<Agent | null>(null);

// ── run mode ──────────────────────────────────────────────────────────────────
let runMode = $state<RunMode>("default");

// ── composer ──────────────────────────────────────────────────────────────────
let textareaEl = $state<HTMLTextAreaElement | null>(null);
let prompt = $state("");
let submitting = $state(false);
let noAgentsHint = $state(false); // flash hint if user submits without an agent

// ── localStorage persistence key ──────────────────────────────────────────────
function lsKey(suffix: string): string {
  const wsId = workspaces.currentId ?? "scratch";
  return `mineco.home.${wsId}.${suffix}`;
}

function savePrefs() {
  try {
    if (selectedAgent) localStorage.setItem(lsKey("agentId"), selectedAgent.id);
    localStorage.setItem(lsKey("runMode"), runMode);
  } catch {
    /* ignore */
  }
}

function loadPrefs(agentList: Agent[]) {
  try {
    const agentId = localStorage.getItem(lsKey("agentId"));
    if (agentId) {
      const found = agentList.find((a) => a.id === agentId);
      if (found) selectedAgent = found;
    }
    const savedMode = localStorage.getItem(lsKey("runMode")) as RunMode | null;
    if (savedMode) runMode = savedMode;
  } catch {
    /* ignore */
  }
  // Fall back to first agent if no pref
  if (!selectedAgent && agentList.length > 0) selectedAgent = agentList[0];
}

// ── load agents ───────────────────────────────────────────────────────────────
async function loadAgents() {
  try {
    const list = await window.mineco.agents.list();
    agents = list;
    loadPrefs(list);
  } catch {
    agents = [];
  }
}

// Reload prefs when workspace changes
$effect(() => {
  void workspaces.currentId; // track
  loadPrefs(agents);
});

onMount(() => {
  void loadAgents();
  textareaEl?.focus();
});

// ── textarea auto-size ────────────────────────────────────────────────────────
function autosize() {
  if (!textareaEl) return;
  textareaEl.style.height = "auto";
  textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, 220)}px`;
}

$effect(() => {
  void prompt; // track
  autosize();
});

const promptTrimmed = $derived(prompt.trim());
const sendHot = $derived(!!promptTrimmed);

// ── submit ────────────────────────────────────────────────────────────────────
async function submit() {
  if (!promptTrimmed) {
    textareaEl?.focus();
    return;
  }
  // If no agent configured, route to settings
  if (!selectedAgent) {
    noAgentsHint = true;
    nav.openSettings();
    return;
  }

  submitting = true;
  try {
    const ws = workspaces.current;
    const session = await window.mineco.sessions.create({
      workspaceId: workspaces.currentId,
      cwd: ws?.path ?? "",
      title: promptTrimmed.slice(0, 60),
    });
    savePrefs();
    nav.openSession(session.id, promptTrimmed);
  } catch (e) {
    console.error("Failed to create session:", e);
    submitting = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void submit();
  }
  // Shift+Tab cycles run modes
  if (e.key === "Tab" && e.shiftKey && selectedAgent) {
    e.preventDefault();
    const modes = window.mineco.runModes(selectedAgent.engine) as RunMode[];
    const idx = modes.indexOf(runMode);
    runMode = modes[(idx + 1) % modes.length];
    savePrefs();
  }
}

function newSession() {
  prompt = "";
  tick().then(() => textareaEl?.focus());
}

function selectAgent(a: Agent) {
  selectedAgent = a;
  savePrefs();
  // Reset mode if selected mode unavailable for new engine
  const available = window.mineco.runModes(a.engine) as RunMode[];
  if (!available.includes(runMode)) runMode = available[0] ?? "default";
}

function setRunMode(m: RunMode) {
  runMode = m;
  savePrefs();
}

// ── starter prompts ───────────────────────────────────────────────────────────
const STARTERS = [
  { icon: "edit", label: "Fix a bug" },
  { icon: "read", label: "Review code" },
  { icon: "run", label: "Write tests" },
  { icon: "search", label: "Explain codebase" },
];

function fillStarter(text: string) {
  prompt = text;
  tick().then(() => {
    autosize();
    textareaEl?.focus();
  });
}

// ── workspace empty state ─────────────────────────────────────────────────────
async function pickWorkspace() {
  const path = await window.mineco.workspaces.pickDirectory();
  if (!path) return;
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  const name =
    parts.slice(-2).join("/") || parts[parts.length - 1] || "workspace";
  await workspaces.create({ name, path });
}
</script>

<div class="absolute inset-0 overflow-hidden bg-canvas" style="display:grid;grid-template-rows:var(--tbh) 1fr">

  <!-- ═══════════════════════════ TITLEBAR ═══════════════════════════════════ -->
  <header
    class="mc-drag z-20 flex items-center gap-[10px] border-b border-line bg-chrome px-2 pl-[14px]"
    style="grid-row:1"
    aria-label="Title bar"
  >
    <!-- macOS traffic lights -->
    <div class="mac-controls items-center gap-2 mr-[6px]" aria-label="Window controls">
      <button class="mac-dot close mc-no-drag size-3 rounded-full border-none" style="background:#FF5F57;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.14)" title="Close">
        <Icon name="close" size={7} stroke={1.1} class="opacity-0 group-hover:opacity-100" />
      </button>
      <button class="mac-dot min mc-no-drag size-3 rounded-full border-none" style="background:#FEBC2E;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.14)" title="Minimize">
        <Icon name="minimize" size={7} stroke={1.1} class="opacity-0" />
      </button>
      <button class="mac-dot max mc-no-drag size-3 rounded-full border-none" style="background:#28C840;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.14)" title="Zoom">
        <Icon name="maximize" size={7} stroke={1.1} class="opacity-0" />
      </button>
    </div>

    <!-- brand -->
    <div class="flex items-baseline gap-[7px]">
      <span class="text-[12.5px] font-bold tracking-[-0.01em]">mineco</span>
      <span class="font-mono text-[9px] font-semibold uppercase tracking-[.1em] text-ink-3">desktop</span>
    </div>

    <div class="flex-1"></div>

    <!-- Windows window controls -->
    <div class="win-controls items-center gap-0.5">
      <button class="mc-no-drag grid size-[26px] place-items-center rounded-[6px] border-none bg-transparent text-ink-2 transition-colors hover:bg-chrome-2 hover:text-ink cursor-pointer" title="Minimize" aria-label="Minimize">
        <svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 5.5h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>
      <button class="mc-no-drag grid size-[26px] place-items-center rounded-[6px] border-none bg-transparent text-ink-2 transition-colors hover:bg-chrome-2 hover:text-ink cursor-pointer" title="Maximize" aria-label="Maximize">
        <svg width="11" height="11" viewBox="0 0 11 11"><rect x="1.9" y="1.9" width="7.2" height="7.2" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
      <button class="mc-no-drag grid size-[26px] place-items-center rounded-[6px] border-none bg-transparent text-ink-2 transition-colors hover:bg-del hover:text-white cursor-pointer" title="Close" aria-label="Close">
        <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2.2 2.2l6.6 6.6M8.8 2.2l-6.6 6.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>
    </div>
  </header>

  <!-- ═══════════════════════════ BODY ═══════════════════════════════════════ -->
  <div style="grid-row:2;display:grid;grid-template-columns:var(--sbw) 1fr;min-height:0">

    <!-- ─────────────────────── SIDEBAR ────────────────────────────────────── -->
    <aside class="flex min-h-0 flex-col gap-3 border-r border-line bg-chrome px-3 py-[14px]">

      <!-- Brand mark -->
      <div class="flex items-center gap-[9px] px-1 pb-0 pt-0.5">
        <img src="/brand/mineco.png" alt="mineco" class="size-[30px] rounded-[8px]" />
        <span class="text-[15px] font-bold tracking-[-0.01em]">mineco</span>
        <span class="font-mono text-[9px] font-semibold uppercase tracking-[.12em] text-ink-3 -ml-0.5">agent</span>
      </div>

      <!-- Workspace switcher -->
      <div class="mx-0.5 mt-0.5">
        <WorkspaceSwitcher />
      </div>

      <!-- New session button -->
      <button
        type="button"
        onclick={newSession}
        class="mc-no-drag flex h-[38px] cursor-pointer items-center justify-center gap-2 rounded-[9px] border-none bg-accent text-[13px] font-semibold text-white shadow-[0_1px_0_rgba(0,0,0,.04)] transition-[filter] hover:brightness-105"
        aria-label={i18n.t("nav.newSession")}
      >
        <Icon name="plus" size={14} stroke={2.2} />
        {i18n.t("nav.newSession")}
      </button>

      <!-- Recent sessions -->
      <RecentSessions />

      <!-- Footer: Settings link -->
      <button
        type="button"
        onclick={() => nav.openSettings()}
        class="mc-no-drag mt-auto flex cursor-pointer items-center gap-[9px] rounded-[0_0_8px_8px] border-none border-t border-line bg-transparent px-[9px] py-[11px] text-[12.5px] text-ink-2 transition-colors hover:bg-chrome-2 hover:text-ink"
        aria-label={i18n.t("nav.settings")}
      >
        <Icon name="gear" size={13} stroke={1.8} class="text-ink-3" />
        {i18n.t("nav.settings")}
      </button>
    </aside>

    <!-- ─────────────────────── MAIN / HERO ────────────────────────────────── -->
    <main class="relative flex min-h-0 flex-col items-center justify-center overflow-auto px-7 pb-10 pt-8">
      <div class="flex w-full max-w-[720px] flex-col items-center">

        <!-- Hero header -->
        <div class="mb-10 flex flex-col items-center gap-[13px]">
          <img
            src="/brand/mineco.png"
            alt="mineco"
            class="size-16 rounded-[18px] shadow-[0_8px_22px_-12px_rgba(20,18,14,.5)]"
          />
          <h1 class="text-center text-[26px] font-semibold tracking-[-0.02em] whitespace-nowrap">
            What should <span class="text-accent-tx">mineco</span> work on?
          </h1>
          <p class="mt-[-3px] max-w-[460px] text-center text-[13.5px] text-ink-2">
            Pick a workspace, then describe what you need — mineco plans, edits and runs your tests.
          </p>
        </div>

        <!-- ══════════════════ COMPOSER ══════════════════ -->
        <div class="relative flex w-full flex-col gap-[9px]">

          <!-- ── Scope row ── -->
          <div class="flex flex-nowrap items-center gap-2">
            <!-- Workspace chip -->
            {#if workspaces.items.length === 0}
              <button
                type="button"
                onclick={pickWorkspace}
                class="mc-no-drag inline-flex h-7 cursor-pointer items-center gap-[6px] rounded-[8px] border border-line bg-card px-[10px] text-[12px] font-[500] text-ink transition-colors hover:border-line-3 hover:bg-card-2"
              >
                <Icon name="folder" size={14} stroke={1.8} class="text-ink-2" />
                {i18n.t("workspace.choose")}
              </button>
            {:else}
              <button
                type="button"
                class="mc-no-drag inline-flex h-7 cursor-default items-center gap-[6px] rounded-[8px] border border-line bg-card px-[10px] text-[12px] font-[500] text-ink"
                disabled
              >
                <Icon name="ws" size={14} stroke={1.8} class="text-ink-2" />
                {workspaces.current?.name ?? i18n.t("workspace.none")}
              </button>
            {/if}

            <!-- Spacer -->
            <span class="flex-1"></span>

            <!-- Agent picker chip -->
            <AgentPicker
              {agents}
              selected={selectedAgent}
              onselect={selectAgent}
            />
          </div>

          <!-- ── Input field ── -->
          <div
            class="flex items-end gap-2 rounded-[var(--r-panel)] border border-line-3 bg-card px-[17px] py-[6px] pr-[11px] shadow-[0_10px_30px_-20px_rgba(48,42,28,.5),0_1px_2px_rgba(48,42,28,.04)] transition-[border-color,box-shadow] focus-within:border-accent-ln focus-within:shadow-[0_12px_30px_-18px_rgba(48,42,28,.4),0_0_0_3px_var(--accent-bg)]"
          >
            <textarea
              bind:this={textareaEl}
              bind:value={prompt}
              onkeydown={onKeydown}
              rows={1}
              placeholder={i18n.t("composer.placeholder")}
              disabled={submitting}
              aria-label="Task description"
              class="min-h-[46px] max-h-[220px] flex-1 min-w-0 resize-none border-none bg-transparent py-[10px] pb-[9px] font-[var(--ui)] text-[14.5px] leading-[1.5] text-ink outline-none placeholder:text-ink-3 disabled:opacity-60"
            ></textarea>

            <!-- Send / return button -->
            <button
              type="button"
              onclick={submit}
              disabled={submitting}
              title="Send · ↩"
              aria-label={i18n.t("send")}
              class={`mc-no-drag mb-[6px] grid size-[34px] flex-none cursor-pointer place-items-center rounded-[9px] border border-transparent transition-[background-color,color,border-color,transform,filter] active:translate-y-px disabled:opacity-50 ${
                sendHot
                  ? "bg-accent text-white hover:brightness-108"
                  : "border-transparent bg-transparent text-ink-3 hover:bg-card-2 hover:text-ink"
              }`}
            >
              <!-- return arrow icon -->
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 10l-4 4 4 4"/><path d="M5 14h11a4 4 0 0 0 4-4V6"/>
              </svg>
            </button>
          </div>

          <!-- ── Toolbar row ── -->
          <div class="flex items-center gap-[7px] px-0.5">
            <!-- Run mode picker -->
            <RunModePicker
              mode={runMode}
              engine={selectedAgent?.engine ?? "claude"}
              onchange={setRunMode}
            />

            <!-- Attach (inert) -->
            <button
              type="button"
              class="mc-no-drag grid size-[31px] cursor-pointer place-items-center rounded-[8px] border-none bg-transparent text-ink-2 transition-colors hover:bg-card-2 hover:text-ink"
              title="Attach files"
              aria-label="Attach files"
            >
              <Icon name="attach" size={17} stroke={1.8} />
            </button>

            <!-- Dictate (inert) -->
            <button
              type="button"
              class="mc-no-drag grid size-[31px] cursor-pointer place-items-center rounded-[8px] border-none bg-transparent text-ink-2 transition-colors hover:bg-card-2 hover:text-ink"
              title="Dictate"
              aria-label="Dictate"
            >
              <Icon name="mic" size={16} stroke={1.8} />
            </button>

            <span class="flex-1"></span>

            <!-- Context ring (cosmetic) -->
            <button
              type="button"
              class="mc-no-drag inline-flex h-[31px] cursor-pointer items-center gap-[6px] rounded-[8px] border border-transparent bg-transparent px-2 font-mono text-[11.5px] text-ink-2 transition-colors hover:bg-card-2"
              title="Context window"
              aria-label="Context window"
            >
              <svg class="shrink-0" width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.4" stroke="var(--line-3)" stroke-width="2.4"/>
                <circle cx="8" cy="8" r="6.4" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round"
                  stroke-dasharray="40.2" stroke-dashoffset="35.4" transform="rotate(-90 8 8)"/>
              </svg>
              12%
            </button>
          </div>

          <!-- ── No-agents hint (shown briefly when user tries to submit) ── -->
          {#if noAgentsHint}
            <div class="mt-1 flex items-center gap-3 rounded-[var(--r-card)] border border-line bg-card px-[14px] py-3">
              <span class="grid size-[22px] flex-none place-items-center rounded-[6px] bg-amber-bg text-amber">
                <Icon name="info" size={13} stroke={1.8} />
              </span>
              <span class="flex-1 text-[13px] text-ink">
                No agents configured.
                <button
                  type="button"
                  onclick={() => nav.openSettings()}
                  class="cursor-pointer border-none bg-transparent p-0 font-semibold text-ink font-[var(--ui)] text-[13px] underline underline-offset-[3px]"
                >
                  Add an agent in Settings
                </button>
                to get started.
              </span>
              <button
                type="button"
                onclick={() => (noAgentsHint = false)}
                class="mc-no-drag grid size-[22px] flex-none cursor-pointer place-items-center rounded-[6px] border-none bg-transparent text-ink-3 transition-colors hover:bg-card-2 hover:text-ink"
                aria-label="Dismiss"
              >
                <Icon name="close" size={9} stroke={1.5} />
              </button>
            </div>
          {/if}
        </div>

        <!-- ── Starter chips ── -->
        <div class="mt-[22px] flex flex-wrap items-center justify-center gap-[9px]">
          {#each STARTERS as s (s.label)}
            <button
              type="button"
              onclick={() => fillStarter(s.label)}
              class="mc-no-drag inline-flex h-[34px] cursor-pointer items-center gap-2 rounded-full border border-line bg-card px-[13px] text-[12.5px] text-ink-2 transition-colors hover:border-line-3 hover:bg-card-2 hover:text-ink"
            >
              <Icon name={s.icon} size={13} stroke={1.8} class="text-ink-3" />
              {s.label}
            </button>
          {/each}
        </div>

      </div><!-- /hero inner -->
    </main>

  </div><!-- /body grid -->
</div><!-- /window -->
