<!--
  Chat.svelte — the session view. Uses the shared SidebarShell for window chrome
  (titlebar + brand + left rail + footer) so it stays visually identical to Home
  and Settings. Its sidebar snippet is a New-session button + the shared
  RecentSessions list; its main snippet is a centered scrolling transcript column
  with a floating bottom composer.

  The transcript is the canonical SQLite transcript loaded via
  window.mineco.sessions.messages on mount / when the active session changes.
  Sending a turn streams live NormalizedEvents through window.mineco.runTurn:
  reasoning -> ThinkBlock, text -> prose, tool -> ToolGroup, result -> finalize,
  error -> error state. The renderer persists nothing — the backend does.
-->
<script lang="ts">
import Icon from "@/renderer/lib/ui/Icon.svelte";
import SidebarShell from "@/renderer/lib/ui/SidebarShell.svelte";
import Composer from "@/renderer/lib/components/chat/Composer.svelte";
import MessageStream from "@/renderer/lib/components/chat/MessageStream.svelte";
import PlanRail from "@/renderer/lib/components/chat/PlanRail.svelte";
import RecentSessions from "@/renderer/lib/components/home/RecentSessions.svelte";
import { onDestroy, onMount, tick } from "svelte";
import type {
  Agent,
  Message,
  NormalizedUsage,
  SessionView,
  ToolRecord,
} from "@/shared/agent-protocol";
import {
  type AssistantBlock,
  type Block,
  type LiveBlock,
  fmtTime,
} from "@/renderer/lib/components/chat/types";
import { applyEvent, makeLiveBlock } from "@/renderer/lib/event-reducer";
import { i18n } from "@/renderer/lib/stores/i18n.svelte";
import { nav } from "@/renderer/lib/stores/nav.svelte";
import { workspaces } from "@/renderer/lib/stores/workspace.svelte";

// ---- data --------------------------------------------------------------
let agents = $state<Agent[]>([]);
let session = $state<SessionView | null>(null);
let blocks = $state<(Block | LiveBlock)[]>([]);
let loading = $state(false);

/** Usage of the most recent completed turn — seeds the context ring on load. */
let seedUsage = $state<NormalizedUsage | null>(null);

/** Live context fill: the latest assistant turn's usage if streamed this
 * session, else the seeded last-turn usage. Drives the composer's ring. */
const contextUsage = $derived.by<NormalizedUsage | null>(() => {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.kind === "assistant") {
      const u = (b as LiveBlock).usage;
      if (u) return u;
    }
  }
  return seedUsage;
});

// composer selection
let agentId = $state<string | null>(null);
// Empty until seeded: `loadAgents` fills it with the session agent's default,
// or the Home-carried selection overrides it (see the session-change effect).
let model = $state<string>("");
let mode = $state<string>("default");

// live run handle
let activeRun: { id: string; stop: () => void } | null = null;
let busy = $state(false);
/** The streaming turn's request id, reactive so question/approval cards can
 * relay answers via window.mineco.respond and disable themselves on stop. */
let activeRequestId = $state<string | null>(null);

// ---- plan / subagent rail --------------------------------------------------
/** The most recent assistant block — the rail reflects its plan + subagents. */
const activeAssistant = $derived.by(() => {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.kind === "assistant") return b;
  }
  return null;
});
const railPlan = $derived(activeAssistant?.plan ?? null);
const railSubagents = $derived(activeAssistant?.subagents ?? null);
/** Show the rail only when there is plan or subagent activity to display. */
const railVisible = $derived(
  (railPlan?.length ?? 0) > 0 || (railSubagents?.length ?? 0) > 0,
);

const curAgent = $derived(
  agents.find((a) => a.id === agentId) ?? agents[0] ?? null,
);

/** The workspace this session is bound to (fixed at creation). Drives the
 * composer's read-only workspace chip. */
const sessionWorkspace = $derived.by(() => {
  const wsId = session?.workspaceId ?? null;
  if (!wsId) return null;
  return workspaces.items.find((w) => w.id === wsId) ?? null;
});

// scroll container
let scrollEl = $state<HTMLDivElement | null>(null);

function nearBottom(): boolean {
  const el = scrollEl;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}

async function scrollToBottom(force = false) {
  if (!force && !nearBottom()) return;
  await tick();
  const el = scrollEl;
  if (el) el.scrollTop = el.scrollHeight;
}

// ---- loading -----------------------------------------------------------

/** Map a stored transcript row into a render block. */
function messageToBlock(m: Message): Block {
  if (m.role === "user") {
    return {
      kind: "user",
      id: m.id,
      text: m.content,
      time: fmtTime(m.createdAt),
    };
  }
  let tools: ToolRecord[] = [];
  try {
    const parsed = JSON.parse(m.tools || "[]");
    if (Array.isArray(parsed)) tools = parsed;
  } catch {
    /* ignore malformed tool json */
  }
  return {
    kind: "assistant",
    id: m.id,
    reasoning: m.reasoning ?? "",
    reasoningLive: false,
    reasoningMs: 0,
    text: m.content,
    tools,
    agentName: curAgent?.name ?? "mineco",
    model: "",
    engine: m.engine,
    time: fmtTime(m.createdAt),
    status: "done",
    error: "",
  };
}

async function loadMessages(id: string) {
  loading = true;
  try {
    const rows = (await window.mineco.sessions.messages(id)) ?? [];
    blocks = rows.map(messageToBlock);
    seedUsage = await window.mineco.sessions.latestUsage(id).catch(() => null);
  } catch {
    blocks = [];
    seedUsage = null;
  } finally {
    loading = false;
    await scrollToBottom(true);
  }
}

async function loadSession(id: string) {
  let found: SessionView | null = null;
  try {
    const all = (await window.mineco.sessions.list()) ?? [];
    found = all.find((s) => s.id === id) ?? null;
  } catch {
    /* ignore */
  }
  session = found;
  // A session is bound to one agent at creation — adopt it as the composer
  // selection. Without this, `loadAgents` defaults `agentId` to the FIRST agent
  // in the list, so opening a session created with a non-first agent silently
  // runs the turn under the wrong agent (and resolves models from its env).
  if (found?.agentId) agentId = found.agentId;
  // Reflect the session's own workspace as the active selection so the sidebar
  // (RecentSessions) and the next new-session default match the open session.
  if (found) workspaces.setCurrent(found.workspaceId);
  await loadMessages(id);
}

// ---- run a turn --------------------------------------------------------

function startTurn(prompt: string) {
  const sid = nav.activeSessionId;
  const aId = agentId ?? curAgent?.id ?? null;
  if (!sid || !aId || busy) return;

  // user bubble
  blocks.push({
    kind: "user",
    id: `u-${Date.now()}`,
    text: prompt,
    time: fmtTime(Date.now()),
  });

  // live assistant block (using event-reducer helper)
  const lb = makeLiveBlock({
    id: `a-${Date.now()}`,
    agentName: curAgent?.name ?? "mineco",
    model,
    engine: curAgent?.engine ?? null,
    time: fmtTime(Date.now()),
  });

  blocks.push(lb);
  const abIndex = blocks.length - 1;
  busy = true;

  void scrollToBottom(true);

  // Always mutate the proxy read back out of the $state array (blocks[i]).
  const live = () => blocks[abIndex] as LiveBlock | undefined;

  const finish = () => {
    busy = false;
    activeRun = null;
    activeRequestId = null;
  };

  const run = window.mineco.runTurn(
    { sessionId: sid, agentId: aId, model, mode, prompt },
    (e) => {
      const b = live();
      if (!b || b.kind !== "assistant") return;
      const terminal = applyEvent(b, e);
      if (terminal) finish();
      void scrollToBottom();
    },
  );
  activeRun = run;
  activeRequestId = run.id;
}

function onSend(text: string) {
  startTurn(text);
}

function onStop() {
  if (activeRun) {
    activeRun.stop();
    activeRun = null;
  }
  activeRequestId = null;
  const i = blocks.findIndex(
    (b) => b.kind === "assistant" && (b as AssistantBlock).status === "running",
  );
  if (i >= 0) {
    const b = blocks[i] as LiveBlock;
    b.reasoningLive = false;
    b.status = "done";
  }
  busy = false;
}

// react to active-session changes (RecentSessions clicks, Home -> Chat).
// Switching while a turn is live stops it first; RecentSessions reloads itself
// when loadSession sets the active workspace.
let lastSid: string | null = null;
$effect(() => {
  const sid = nav.activeSessionId;
  if (sid && sid !== lastSid) {
    lastSid = sid;
    if (busy) onStop();
    void loadSession(sid).then(() => {
      // Apply the model/mode the user picked on Home BEFORE consuming (which
      // clears them), so the seeded first turn runs with that selection rather
      // than the agent default. `loadAgents` no longer clobbers a set model.
      const carriedModel = nav.pendingModel;
      const carriedMode = nav.pendingMode;
      const pending = nav.consumePendingPrompt();
      if (carriedModel) model = carriedModel;
      if (carriedMode) mode = carriedMode;
      if (pending && !busy) startTurn(pending);
    });
  }
});

/** (Re)loads the agent list. Preserves the current selection when it survives. */
async function loadAgents() {
  let next: Agent[];
  try {
    next = (await window.mineco.agents.list()) ?? [];
  } catch {
    next = [];
  }
  agents = next;
  if (!next.length) return;
  // Keep the user's pick if it still exists; otherwise fall back to the first.
  // Only seed `model` when it is unset — never clobber an explicit selection
  // (e.g. one carried from Home), which would silently downgrade the turn to
  // the agent's default model. The Composer corrects an invalid role id.
  if (!next.some((a) => a.id === agentId)) {
    agentId = next[0].id;
    if (!model) model = next[0].defaultModel || "sonnet";
  }
}

const unsubAgents = window.mineco.onAgentsChanged(() => void loadAgents());

onMount(() => void loadAgents());

onDestroy(() => {
  if (activeRun) activeRun.stop();
  unsubAgents();
});

// session header bits
const headerScope = $derived(
  sessionWorkspace?.rootPath
    ? `${sessionWorkspace.name} / main`
    : i18n.t("workspace.none"),
);
const sessionTitle = $derived(
  session?.title || nav.activeSessionId || "Session",
);
</script>

<SidebarShell
  footerIcon="gear"
  footerLabel={i18n.t("nav.settings")}
  onfooter={() => nav.openSettings()}
  {railVisible}
>
  <!-- ─────────────────────── SIDEBAR ────────────────────────────────────── -->
  {#snippet sidebar()}
    <!-- New session → back to the Home / new-session screen -->
    <button
      type="button"
      onclick={() => nav.goHome()}
      class="mc-no-drag flex h-[38px] cursor-pointer items-center justify-center gap-2 rounded-[9px] border-none bg-accent text-[13px] font-semibold text-white shadow-[0_1px_0_rgba(0,0,0,.04)] transition-[filter] hover:brightness-105"
      aria-label={i18n.t("nav.newSession")}
    >
      <Icon name="plus" size={14} stroke={2.2} />
      {i18n.t("nav.newSession")}
    </button>

    <RecentSessions />
  {/snippet}

  <!-- ─────────────────────── MAIN: transcript + composer ────────────────── -->
  {#snippet main()}
    <main class="relative min-h-0 bg-canvas">
      <div bind:this={scrollEl} class="mc-scroll absolute inset-0 overflow-y-auto">
        <div class="mx-auto flex max-w-[720px] flex-col gap-[18px] px-9 pb-[220px] pt-[34px]">
          <!-- session header -->
          <header class="border-b border-line-2 pb-1">
            <div class="font-mono text-[10.5px] font-semibold uppercase tracking-[.1em] text-ink-3">
              <span class="text-accent-tx">{i18n.t("nav.sessions")}</span> · {headerScope}
            </div>
            <h1 class="mb-3.5 mt-[7px] text-[24px] font-bold leading-[1.18] tracking-[-.02em] text-ink [text-wrap:balance]">
              {sessionTitle}
            </h1>
          </header>

          {#if loading}
            <div class="py-6 text-center text-[13px] text-ink-3">Loading…</div>
          {:else if blocks.length === 0}
            <div class="py-10 text-center text-[13px] text-ink-3">
              {agents.length === 0
                ? i18n.t("empty.noAgents")
                : i18n.t("composer.placeholder")}
            </div>
          {:else}
            <MessageStream {blocks} requestId={activeRequestId} />
          {/if}
        </div>
      </div>

      <!-- floating composer.
           The composer floats with transparent chip/toolbar rows, so without a
           backdrop the transcript shows through them (and the gaps) while
           scrolling. A bottom fade (transparent → canvas) sits above it so the
           transcript text fades out instead; the gradient reaches solid canvas
           at the composer's top edge (pt-14 == 56px stop), so nothing bleeds
           through the composer itself. -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-[linear-gradient(to_bottom,transparent,var(--canvas)_56px)] px-9 pb-6 pt-14"
      >
        <div class="pointer-events-auto w-full max-w-[720px]">
          {#if agents.length === 0}
            <div class="flex items-center justify-between gap-3 rounded-[var(--r-panel)] border border-line-3 bg-chrome px-4 py-3 text-[13px] text-ink-2">
              {i18n.t("empty.noAgents")}
              <button
                type="button"
                onclick={() => nav.openSettings()}
                class="rounded-[var(--r-field)] bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white"
              >
                {i18n.t("empty.noAgentsCta")}
              </button>
            </div>
          {:else}
            <Composer
              {agents}
              bind:agentId
              bind:model
              bind:mode
              {busy}
              usage={contextUsage}
              workspace={sessionWorkspace}
              onsend={onSend}
              onstop={onStop}
            />
          {/if}
        </div>
      </div>
    </main>
  {/snippet}

  <!-- ─────────────────────── RIGHT RAIL: plan + subagents ───────────────── -->
  {#snippet rail()}
    <PlanRail plan={railPlan} subagents={railSubagents} />
  {/snippet}
</SidebarShell>
