<!--
  Home.svelte — the new-session / landing screen.
  Layout: custom titlebar + left sidebar + centered hero + shared Composer.

  On submit: creates a session, stashes the prompt via nav.pendingPrompt, then
  routes to nav.openSession(id). Submitting without an agent routes to Settings.

  Persist last-used agent id, model and run mode per workspace in localStorage.
  The composer (scope chips, agent/model pickers, input, toolbar) is the same
  component used by the Chat view.
-->
<script lang="ts">
import { i18n } from "@/renderer/lib/stores/i18n.svelte";
import Icon from "@/renderer/lib/ui/Icon.svelte";
import SidebarShell from "@/renderer/lib/ui/SidebarShell.svelte";
import Composer from "@/renderer/lib/components/chat/Composer.svelte";
import RecentSessions from "@/renderer/lib/components/home/RecentSessions.svelte";
import { onDestroy, onMount, untrack } from "svelte";
import type { Agent } from "@/shared/agent-protocol";
import { nav } from "@/renderer/lib/stores/nav.svelte";
import { workspaces } from "@/renderer/lib/stores/workspace.svelte";

// ── composer selection ──────────────────────────────────────────────────────
let agents = $state<Agent[]>([]);
let agentId = $state<string | null>(null);
let model = $state<string>("");
let mode = $state<string>("default");
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
    if (agentId) localStorage.setItem(lsKey("agentId"), agentId);
    if (model) localStorage.setItem(lsKey("model"), model);
    localStorage.setItem(lsKey("runMode"), mode);
  } catch {
    /* ignore */
  }
}

function loadPrefs(agentList: Agent[]) {
  try {
    const savedAgent = localStorage.getItem(lsKey("agentId"));
    if (savedAgent && agentList.some((a) => a.id === savedAgent)) {
      agentId = savedAgent;
    }
    const savedModel = localStorage.getItem(lsKey("model"));
    if (savedModel) model = savedModel;
    const savedMode = localStorage.getItem(lsKey("runMode"));
    if (savedMode) mode = savedMode;
  } catch {
    /* ignore */
  }
  // Fall back to first agent if no pref
  if (!agentId && agentList.length > 0) agentId = agentList[0].id;
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

// Reload prefs when the workspace changes — and ONLY then. `loadPrefs` both
// reads and writes `agentId`/`model`, so tracking it here would make the effect
// re-run on every manual selection and immediately revert it to the saved value
// (the "agent picker does nothing, stays on the first agent" bug). `untrack`
// pins the dependency to `workspaces.currentId` alone.
$effect(() => {
  void workspaces.currentId; // track
  untrack(() => loadPrefs(agents));
});

const unsubAgents = window.mineco.onAgentsChanged(() => void loadAgents());

onMount(() => {
  void loadAgents();
});

onDestroy(() => unsubAgents());

// ── submit ────────────────────────────────────────────────────────────────────
async function onSend(text: string) {
  // If no agent configured, route to settings
  if (!agentId) {
    noAgentsHint = true;
    nav.openSettings();
    return;
  }

  submitting = true;
  try {
    const session = await window.mineco.sessions.create({
      workspaceId: workspaces.currentId,
      agentId,
      title: text.slice(0, 60),
    });
    savePrefs();
    // Carry the picked model + mode so the seeded first turn runs with the
    // user's selection — Chat would otherwise fall back to the agent default.
    nav.openSession(session.id, text, model, mode);
  } catch (e) {
    console.error("Failed to create session:", e);
    submitting = false;
  }
}

function newSession() {
  prompt = "";
}

// Persist selection whenever it changes.
$effect(() => {
  void agentId;
  void model;
  void mode;
  savePrefs();
});

// ── starter prompts ───────────────────────────────────────────────────────────
const STARTERS = [
  { icon: "edit", label: "Fix a bug" },
  { icon: "read", label: "Review code" },
  { icon: "run", label: "Write tests" },
  { icon: "search", label: "Explain codebase" },
];

function fillStarter(text: string) {
  prompt = text;
}
</script>

<SidebarShell
  footerIcon="gear"
  footerLabel={i18n.t("nav.settings")}
  onfooter={() => nav.openSettings()}
>
  <!-- ─────────────────────── SIDEBAR ────────────────────────────────────── -->
  {#snippet sidebar()}
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
  {/snippet}

  <!-- ─────────────────────── MAIN / HERO ────────────────────────────────── -->
  {#snippet main()}
    <main class="relative flex min-h-0 flex-col items-center justify-center overflow-auto px-7 pb-10 pt-8">
      <div class="flex w-full max-w-[720px] flex-col items-center">

        <!-- Hero header -->
        <div class="mb-10 flex flex-col items-center gap-[13px]">
          <img
            src="./brand/mineco.png"
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
          <Composer
            {agents}
            bind:agentId
            bind:model
            bind:mode
            bind:value={prompt}
            busy={submitting}
            canSwitchWorkspace
            onsend={onSend}
          />

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
  {/snippet}
</SidebarShell>
