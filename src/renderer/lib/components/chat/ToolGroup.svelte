<!--
  ToolGroup — aggregates a contiguous run of tool invocations into one capsule.
  Each tool gets an icon by kind, its name + detail, and a running spinner /
  done check. While the group is still running it shows a "Working…" header;
  once the turn finishes it shows a "Worked" summary. Mirrors the prototype's
  ToolGroup6 rail (t6-*). No fake diff/terminal panels — a clean row list.

  Subagent pills: when subagents are provided (from block.subagents), a compact
  row of pills is rendered below the tool list showing each subagent's name and
  status (running spinner / ok dot / error dot).
-->
<script lang="ts">
import Icon from "@/renderer/lib/ui/Icon.svelte";
import type { ToolRecord } from "@/shared/agent-protocol";
import type { Subagent, ToolItem } from "@/renderer/lib/event-reducer";

let {
  tools,
  running = false,
  subagents = [],
}: {
  /** Tool records for this group, in invocation order (ToolItem during streaming, ToolRecord from DB). */
  tools: (ToolItem | ToolRecord)[];
  /** True while the turn is still streaming (last tool may be in-flight). */
  running?: boolean;
  /** Native Task subagents spawned during this turn. Rendered as inline pills. */
  subagents?: Subagent[];
} = $props();

/** Whether a tool entry is "complete" (end phase). */
function isDone(t: ToolItem | ToolRecord): boolean {
  if ("phase" in t) return t.phase === "end";
  return true; // ToolRecord from DB is always done
}

/** Status of a tool item. */
function statusOf(t: ToolItem | ToolRecord): "ok" | "error" | undefined {
  if ("status" in t) return t.status;
  return undefined;
}

/** Map a tool name to one of the stroke icons. */
function iconFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("search") || n.includes("grep") || n.includes("glob"))
    return "search";
  if (n.includes("read") || n.includes("cat") || n.includes("view"))
    return "read";
  if (n.includes("edit") || n.includes("write") || n.includes("apply"))
    return "edit";
  if (
    n.includes("bash") ||
    n.includes("run") ||
    n.includes("exec") ||
    n.includes("shell") ||
    n.includes("test")
  )
    return "run";
  if (n.includes("task") || n.includes("agent") || n.includes("subagent"))
    return "bot";
  if (n.includes("fetch") || n.includes("web")) return "globe";
  return "sparkle";
}
</script>

<div class="flex w-full flex-col gap-1.5 [animation:p-rise_.4s_cubic-bezier(.2,.7,.3,1)_both]">
  <div
    class="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.09em] text-ink-3"
  >
    <Icon name="sparkle" size={12} />
    {#if running}
      <span class="mc-tool-live">Working…</span>
    {:else if tools.length > 0}
      <span>Worked</span>
      <span class="text-ink-3">· {tools.length} {tools.length === 1 ? "step" : "steps"}</span>
    {:else}
      <!-- subagents-only block: no tool steps to count -->
      <span>Worked</span>
    {/if}
  </div>

  {#if tools.length > 0}
    <div
      class="flex flex-col gap-0.5 rounded-[var(--r-card)] border border-line-2 bg-card-2/40 p-1.5"
    >
      {#each tools as tool, i (i)}
        {@const isLast = i === tools.length - 1}
        {@const isRunning = running && isLast && !isDone(tool)}
        {@const st = statusOf(tool)}
        <div
          class="flex items-center gap-2.5 rounded-[var(--r-field)] px-2 py-1.5"
        >
          <span class="grid size-4 flex-none place-items-center text-ink-3">
            {#if isRunning}
              <span class="mc-spin"></span>
            {:else if st === "error"}
              <span class="text-del"><Icon name="info" size={12} stroke={2} /></span>
            {:else}
              <span class="text-accent-tx"><Icon name="check" size={12} stroke={2.6} /></span>
            {/if}
          </span>
          <span class="flex-none text-ink-2">
            <Icon name={iconFor(tool.name)} size={13} />
          </span>
          <span class="flex-none text-[12.5px] font-medium text-ink">
            {#if isRunning}<span class="mc-tool-live">{tool.name}…</span>{:else}{tool.name}{/if}
          </span>
          {#if tool.detail}
            <span class="truncate font-mono text-[11px] text-ink-3">{tool.detail}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if subagents.length > 0}
    <!-- Subagent pills: compact inline row below the tool list. -->
    <div class="mt-1 flex flex-wrap gap-1.5">
      {#each subagents as sa (sa.subId)}
        <span
          class="mc-subagent-pill inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium"
          class:mc-pill-running={sa.status === "running"}
          class:mc-pill-ok={sa.status === "ok" || sa.status === undefined}
          class:mc-pill-error={sa.status === "error"}
        >
          {#if sa.status === "running"}
            <span class="mc-spin-xs" aria-hidden="true"></span>
          {:else if sa.status === "error"}
            <span class="mc-dot mc-dot-error" aria-hidden="true"></span>
          {:else}
            <span class="mc-dot mc-dot-ok" aria-hidden="true"></span>
          {/if}
          <span class="truncate max-w-[120px]">{sa.agentName}</span>
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .mc-tool-live {
    background: linear-gradient(
      90deg,
      var(--accent-tx) 36%,
      #fff 50%,
      var(--accent-tx) 64%
    );
    background-size: 220% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: sheen 1.8s linear infinite;
  }
  .mc-spin {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid color-mix(in oklab, var(--accent) 30%, transparent);
    border-top-color: var(--accent-tx);
    animation: spin 0.7s linear infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .mc-tool-live {
      animation: none;
      color: var(--accent-tx);
      background: none;
      -webkit-text-fill-color: var(--accent-tx);
    }
    .mc-spin {
      animation: none;
    }
  }

  /* Subagent pills */
  .mc-subagent-pill {
    transition: opacity 0.2s;
  }
  .mc-pill-running {
    border-color: color-mix(in oklab, var(--accent) 35%, transparent);
    color: var(--accent-tx);
    background: color-mix(in oklab, var(--accent) 8%, transparent);
  }
  .mc-pill-ok {
    border-color: var(--line-2);
    color: var(--ink-3);
    background: color-mix(in oklab, var(--card-2) 40%, transparent);
  }
  .mc-pill-error {
    border-color: color-mix(in oklab, var(--del) 30%, transparent);
    color: var(--del);
    background: color-mix(in oklab, var(--del) 6%, transparent);
  }

  .mc-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .mc-dot-ok {
    background: color-mix(in oklab, var(--accent-tx) 70%, transparent);
  }
  .mc-dot-error {
    background: var(--del);
  }

  .mc-spin-xs {
    display: inline-block;
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1.5px solid color-mix(in oklab, var(--accent) 30%, transparent);
    border-top-color: var(--accent-tx);
    animation: spin 0.7s linear infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .mc-spin-xs {
      animation: none;
      border-color: var(--accent-tx);
    }
  }
</style>
