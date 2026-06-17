<!--
  RecentSessions — the sidebar list of sessions for the current workspace.
  Polls once on mount (and when workspace changes) and subscribes to
  onRunStateChanged to show a pulsing dot for running sessions.
  Clicking a row opens the chat view via nav.openSession().
-->
<script lang="ts">
import { i18n } from "@/renderer/lib/stores/i18n.svelte";
import { nav } from "@/renderer/lib/stores/nav.svelte";
import type { SessionView } from "@/shared/agent-protocol";
import { workspaces } from "@/renderer/lib/stores/workspace.svelte";
import { onRunStateChanged } from "@/renderer/lib/ipc";
import { onDestroy } from "svelte";

let sessions = $state<SessionView[]>([]);
/** Set of currently-running session ids, fed by onRunStateChanged broadcast. */
let runningIds = $state<Set<string>>(new Set());

async function load(workspaceId: string | null | undefined) {
  try {
    const raw = await window.mineco.sessions.list(workspaceId ?? null);
    // Sort by createdAt descending
    sessions = [...raw].sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    sessions = [];
  }
}

$effect(() => {
  void load(workspaces.currentId);
});

// Subscribe to run-state broadcasts.
const unsubscribe = onRunStateChanged((ids) => {
  runningIds = new Set(ids);
});

onDestroy(unsubscribe);

function isRunning(id: string): boolean {
  return runningIds.has(id);
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  return `${d}d`;
}
</script>

<div class="font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-ink-3 px-[6px] py-[2px]">
  {i18n.t("nav.recent")}
</div>

<div class="flex flex-col gap-0.5 overflow-auto mc-scroll flex-1">
  {#if sessions.length === 0}
    <div class="px-[9px] py-[8px] text-[12px] text-ink-3">
      {i18n.t("empty.noSessions")}
    </div>
  {:else}
    {#each sessions as session (session.id)}
      {@const running = isRunning(session.id) || session.running}
      <button
        type="button"
        onclick={() => nav.openSession(session.id)}
        class="flex flex-col gap-px rounded-[8px] border border-transparent bg-transparent px-[9px] py-[8px] text-left transition-colors hover:bg-chrome-2 cursor-pointer"
      >
        <span class="truncate text-[12.5px] font-[500] text-ink">
          {session.title || "Untitled session"}
        </span>
        {#if running}
          <span class="inline-flex items-center gap-[5px] font-mono text-[9.5px] font-semibold tracking-[.04em] text-accent-tx">
            <span class="mc-rdot"></span>
            running
          </span>
        {:else}
          <span class="text-[11px] text-ink-3">{relTime(session.createdAt)}</span>
        {/if}
      </button>
    {/each}
  {/if}
</div>
