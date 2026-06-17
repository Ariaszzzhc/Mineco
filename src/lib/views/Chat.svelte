<!--
  Chat.svelte — the session view. A solid (non-glass) 3-pane Electron shell:
  a custom titlebar, a left sidebar (brand + workspace switcher + New session +
  Recent sessions + Settings link), a centered scrolling transcript column, and
  a floating bottom composer.

  The transcript is the canonical SQLite transcript loaded via
  window.mineco.sessions.messages on mount / when the active session changes.
  Sending a turn streams live NormalizedEvents through window.mineco.runTurn:
  reasoning -> ThinkBlock, text -> prose, tool -> ToolGroup, result -> finalize,
  error -> error state. The renderer persists nothing — the backend does.
-->
<script lang="ts">
import Icon from "../ui/Icon.svelte";
import Popover from "../ui/Popover.svelte";
import Composer from "../components/chat/Composer.svelte";
import MessageStream from "../components/chat/MessageStream.svelte";
import { onDestroy, onMount, tick } from "svelte";
import type {
  Agent,
  Message,
  NormalizedEvent,
  RunMode,
  Session,
  ToolRecord,
} from "../agent-protocol";
import {
  type AssistantBlock,
  type Block,
  fmtTime,
} from "../components/chat/types";
import { i18n } from "../stores/i18n.svelte";
import { nav } from "../stores/nav.svelte";
import { workspaces } from "../stores/workspace.svelte";

// ---- data --------------------------------------------------------------
let agents = $state<Agent[]>([]);
let sessions = $state<Session[]>([]);
let session = $state<Session | null>(null);
let blocks = $state<Block[]>([]);
let loading = $state(false);

// composer selection
let agentId = $state<string | null>(null);
let model = $state<string>("");
let mode = $state<RunMode>("default");

// live run handle
let activeRun: { id: string; stop: () => void } | null = null;
let busy = $state(false);

const curWorkspace = $derived(workspaces.current);
const curAgent = $derived(
  agents.find((a) => a.id === agentId) ?? agents[0] ?? null,
);

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
  } catch {
    blocks = [];
  } finally {
    loading = false;
    await scrollToBottom(true);
  }
}

async function loadSession(id: string) {
  let found = sessions.find((s) => s.id === id) ?? null;
  if (!found) {
    try {
      const all = (await window.mineco.sessions.list()) ?? [];
      found = all.find((s) => s.id === id) ?? null;
    } catch {
      /* ignore */
    }
  }
  session = found;
  await loadMessages(id);
}

async function refreshSessions() {
  try {
    sessions =
      (await window.mineco.sessions.list(curWorkspace?.id ?? null)) ?? [];
  } catch {
    sessions = [];
  }
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

  // live assistant block
  const ab: AssistantBlock = {
    kind: "assistant",
    id: `a-${Date.now()}`,
    reasoning: "",
    reasoningLive: false,
    reasoningMs: 0,
    text: "",
    tools: [],
    agentName: curAgent?.name ?? "mineco",
    model,
    engine: curAgent?.engine ?? null,
    time: fmtTime(Date.now()),
    status: "running",
    error: "",
  };
  blocks.push(ab);
  const abIndex = blocks.length - 1;
  busy = true;

  const reasoningStart = Date.now();
  let reasoningStarted = false;

  void scrollToBottom(true);

  // Always mutate the proxy read back out of the $state array (blocks[i]).
  const live = () => blocks[abIndex] as AssistantBlock | undefined;

  const endReasoning = (b: AssistantBlock) => {
    if (b.reasoningLive) {
      b.reasoningLive = false;
      b.reasoningMs = Date.now() - reasoningStart;
    }
  };

  const finish = () => {
    busy = false;
    activeRun = null;
    void refreshSessions();
  };

  activeRun = window.mineco.runTurn(
    { sessionId: sid, agentId: aId, model, mode, prompt },
    (e: NormalizedEvent) => {
      const b = live();
      if (!b || b.kind !== "assistant") return;
      switch (e.type) {
        case "reasoning":
          reasoningStarted = true;
          b.reasoning += e.text;
          b.reasoningLive = b.text.length === 0;
          break;
        case "text":
          if (reasoningStarted) endReasoning(b);
          b.text += e.text;
          break;
        case "tool":
          endReasoning(b);
          b.tools.push({ name: e.name, detail: e.detail });
          break;
        case "result":
          endReasoning(b);
          if (e.text && !b.text) b.text = e.text;
          b.status = "done";
          finish();
          break;
        case "error":
          b.reasoningLive = false;
          b.status = "error";
          b.error = e.message;
          finish();
          break;
        case "thread":
          break;
      }
      void scrollToBottom();
    },
  );
}

function onSend(text: string) {
  startTurn(text);
}

function onStop() {
  if (activeRun) {
    activeRun.stop();
    activeRun = null;
  }
  const i = blocks.findIndex(
    (b) => b.kind === "assistant" && b.status === "running",
  );
  if (i >= 0) {
    const b = blocks[i] as AssistantBlock;
    b.reasoningLive = false;
    b.status = "done";
  }
  busy = false;
}

// ---- session switching from the sidebar --------------------------------
function openRecent(id: string) {
  if (id === nav.activeSessionId) return;
  if (busy) onStop();
  nav.openSession(id);
}

// react to active-session changes (sidebar clicks, Home -> Chat)
let lastSid: string | null = null;
$effect(() => {
  const sid = nav.activeSessionId;
  if (sid && sid !== lastSid) {
    lastSid = sid;
    if (busy) onStop();
    void loadSession(sid).then(() => {
      const pending = nav.consumePendingPrompt();
      if (pending && !busy) startTurn(pending);
    });
  }
});

// keep sessions list in sync with the workspace selection
$effect(() => {
  void curWorkspace;
  void refreshSessions();
});

onMount(async () => {
  try {
    agents = (await window.mineco.agents.list()) ?? [];
  } catch {
    agents = [];
  }
  if (agents.length) agentId = agents[0].id;
});

onDestroy(() => {
  if (activeRun) activeRun.stop();
});

// session header bits
const headerScope = $derived(
  curWorkspace ? `${curWorkspace.name} / main` : i18n.t("workspace.shared"),
);
const sessionTitle = $derived(
  session?.title || nav.activeSessionId || "Session",
);
</script>

<div class="absolute inset-0 grid grid-rows-[var(--tbh)_1fr] bg-app font-ui text-ink">
  <!-- titlebar -->
  <div class="mc-drag relative z-20 flex items-center border-b border-line bg-chrome px-2">
    <div class="mac-controls items-center gap-2 mr-2 mc-no-drag">
      <button class="mc-no-drag size-3 rounded-full bg-[#FF5F57]" title="Close" aria-label="Close"></button>
      <button class="mc-no-drag size-3 rounded-full bg-[#FEBC2E]" title="Minimize" aria-label="Minimize"></button>
      <button class="mc-no-drag size-3 rounded-full bg-[#28C840]" title="Zoom" aria-label="Zoom"></button>
    </div>
    <div class="flex items-baseline gap-[7px]">
      <span class="text-[12.5px] font-bold tracking-[-.01em] text-ink">mineco</span>
      <span class="font-mono text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-3">desktop</span>
    </div>
    <div class="flex-1"></div>
    <div class="win-controls items-center gap-0.5 mc-no-drag">
      <button class="mc-no-drag grid size-7 place-items-center rounded text-ink-2 hover:bg-chrome-2" title="Minimize" aria-label="Minimize">
        <svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 5.5h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
      </button>
      <button class="mc-no-drag grid size-7 place-items-center rounded text-ink-2 hover:bg-chrome-2" title="Maximize" aria-label="Maximize">
        <svg width="11" height="11" viewBox="0 0 11 11"><rect x="1.9" y="1.9" width="7.2" height="7.2" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
      <button class="mc-no-drag grid size-7 place-items-center rounded text-ink-2 hover:bg-[#E5484D] hover:text-white" title="Close" aria-label="Close">
        <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2.2 2.2l6.6 6.6M8.8 2.2l-6.6 6.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
      </button>
    </div>
  </div>

  <!-- body: sidebar + main -->
  <div class="grid min-h-0 grid-cols-[var(--sbw)_1fr]">
    <!-- sidebar -->
    <aside class="flex min-h-0 flex-col gap-1 border-r border-line bg-chrome p-2.5">
      <div class="flex items-center gap-2.5 px-1.5 pb-3 pt-0.5">
        <img class="size-6 flex-none rounded-[7px] shadow-[0_0_0_1px_var(--line)]" src="/brand/mineco.png" alt="" />
        <span class="text-[15.5px] font-bold tracking-[-.01em] text-ink">mineco</span>
        <span class="ml-auto font-mono text-[9.5px] font-semibold uppercase tracking-[.08em] text-ink-3">agent</span>
      </div>

      <!-- workspace switcher -->
      {#if workspaces.items.length}
        <Popover side="bottom" align="start" class="min-w-[220px]">
          {#snippet trigger()}
            <button
              type="button"
              class="mc-no-drag flex w-full items-center gap-2 rounded-[var(--r-field)] border border-line-2 bg-chrome-2 px-2.5 py-2 text-left outline-none hover:bg-card-2"
              title="Switch workspace"
            >
              <span class="flex-none text-ink-2"><Icon name="workspace" size={15} /></span>
              <span class="flex min-w-0 flex-col">
                <span class="truncate text-[12.5px] font-semibold text-ink">
                  {curWorkspace?.name ?? i18n.t("workspace.shared")}
                </span>
                <span class="font-mono text-[9.5px] uppercase tracking-[.06em] text-ink-3">
                  {i18n.t("workspace")}
                </span>
              </span>
              <span class="ml-auto text-ink-3"><Icon name="chev" size={12} /></span>
            </button>
          {/snippet}
          <div class="px-2 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-ink-3">
            {i18n.t("workspace")}
          </div>
          <button
            type="button"
            onclick={() => workspaces.setCurrent(null)}
            class="flex w-full items-center gap-2.5 rounded-[var(--r-field)] px-2 py-1.5 text-left outline-none hover:bg-card-2"
          >
            <span class="flex-none text-ink-2"><Icon name="workspace" size={14} /></span>
            <span class="flex-1 text-[13px] text-ink">{i18n.t("workspace.shared")}</span>
            {#if !curWorkspace}
              <span class="text-accent-tx"><Icon name="check" size={13} stroke={2.4} /></span>
            {/if}
          </button>
          {#each workspaces.items as w (w.id)}
            <button
              type="button"
              onclick={() => workspaces.setCurrent(w.id)}
              class="flex w-full items-center gap-2.5 rounded-[var(--r-field)] px-2 py-1.5 text-left outline-none hover:bg-card-2"
            >
              <span class="flex-none text-ink-2"><Icon name="workspace" size={14} /></span>
              <span class="flex min-w-0 flex-col">
                <span class="truncate text-[13px] text-ink">{w.name}</span>
                {#if w.path}<span class="truncate text-[11px] text-ink-3">{w.path}</span>{/if}
              </span>
              {#if curWorkspace?.id === w.id}
                <span class="ml-auto text-accent-tx"><Icon name="check" size={13} stroke={2.4} /></span>
              {/if}
            </button>
          {/each}
        </Popover>
      {/if}

      <button
        type="button"
        onclick={() => nav.goHome()}
        class="mc-no-drag mt-1 flex items-center justify-center gap-1.5 rounded-[var(--r-field)] bg-accent px-3 py-2 text-[12.5px] font-semibold text-white outline-none transition-[filter] hover:brightness-110 active:translate-y-px"
      >
        <Icon name="plus" size={14} /> {i18n.t("nav.newSession")}
      </button>

      <div class="px-2 pb-1.5 pt-3 font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-ink-3">
        {i18n.t("nav.recent")}
      </div>
      <div class="mc-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {#if sessions.length === 0}
          <div class="px-2 py-2 text-[12px] text-ink-3">{i18n.t("empty.noSessions")}</div>
        {:else}
          {#each sessions as s (s.id)}
            <button
              type="button"
              onclick={() => openRecent(s.id)}
              class="mc-no-drag flex flex-col gap-1 rounded-[var(--r-field)] px-2.5 py-2 text-left outline-none transition-colors {s.id ===
              nav.activeSessionId
                ? 'bg-card-2 shadow-[inset_0_0_0_1px_var(--line)]'
                : 'hover:bg-chrome-2'}"
            >
              <span
                class="truncate text-[12.5px] leading-tight {s.id === nav.activeSessionId
                  ? 'font-semibold text-ink'
                  : 'font-medium text-ink-2'}"
              >
                {s.title || "Untitled session"}
              </span>
              {#if s.status === "running"}
                <span class="inline-flex items-center gap-1.5 font-mono text-[9.5px] font-semibold tracking-[.04em] text-accent-tx">
                  <span class="mc-rdot"></span> running
                </span>
              {:else}
                <span class="font-mono text-[10px] text-ink-3">{fmtTime(s.createdAt)}</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <div class="mt-1 border-t border-line pt-2.5">
        <button
          type="button"
          onclick={() => nav.openSettings()}
          class="mc-no-drag flex w-full items-center gap-2 rounded-[var(--r-field)] px-2 py-1.5 text-left font-mono text-[10.5px] text-ink-2 outline-none hover:bg-chrome-2"
        >
          <span class="text-ink-3"><Icon name="gear" size={13} /></span>
          {i18n.t("nav.settings")}
        </button>
      </div>
    </aside>

    <!-- main: transcript + composer -->
    <div class="relative min-h-0 bg-canvas">
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
            <MessageStream {blocks} />
          {/if}
        </div>
      </div>

      <!-- floating composer -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-9 pb-6">
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
              onsend={onSend}
              onstop={onStop}
            />
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
