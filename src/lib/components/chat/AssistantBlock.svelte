<!--
  AssistantBlock — one assistant turn: a byline (agent · model · time), the
  ThinkBlock (reasoning, live or folded), the ToolGroup capsule (if any tools
  ran), and the streamed prose. Shows an error state when the turn failed.
  Mirrors the prototype's p-agent-block layout.
-->
<script lang="ts">
import Icon from "../../ui/Icon.svelte";
import ThinkBlock from "./ThinkBlock.svelte";
import ToolGroup from "./ToolGroup.svelte";
import type { AssistantBlock } from "./types";

let { block }: { block: AssistantBlock } = $props();

const engineIcon = $derived(
  block.engine === "codex" ? "/brand/codex-icon.png" : "/brand/claude-icon.png",
);
</script>

<div class="flex w-full flex-col items-start gap-3 [animation:p-rise_.4s_cubic-bezier(.2,.7,.3,1)_both]">
  <!-- byline -->
  <div class="flex items-baseline gap-2">
    <span class="inline-flex items-center gap-1.5 text-[12px] font-bold text-accent-tx">
      <img class="size-[17px] rounded" src={engineIcon} alt="" />
      {block.agentName}
    </span>
    {#if block.model}
      <span class="font-mono text-[10.5px] text-ink-3">{block.model}</span>
    {/if}
    <span class="font-mono text-[10.5px] text-ink-3">{block.time}</span>
    {#if block.status === "running"}
      <span class="mc-rdot" aria-label="running"></span>
    {/if}
  </div>

  <ThinkBlock
    text={block.reasoning}
    live={block.reasoningLive}
    durationMs={block.reasoningMs}
  />

  {#if block.tools.length}
    <ToolGroup tools={block.tools} running={block.status === "running"} />
  {/if}

  {#if block.text}
    <p class="m-0 max-w-[64ch] whitespace-pre-wrap text-[14.5px] leading-[1.62] text-ink [text-wrap:pretty]">{block.text}{#if block.status === "running"}<span class="mc-caret"></span>{/if}</p>
  {:else if block.status === "running" && !block.reasoningLive && !block.tools.length}
    <p class="m-0 text-[13px] text-ink-3">
      <span class="mc-caret"></span>
    </p>
  {/if}

  {#if block.status === "error"}
    <div
      class="flex w-full items-start gap-2 rounded-[var(--r-card)] border border-line-2 bg-card-2/40 px-3 py-2.5 text-[13px] text-del"
    >
      <span class="mt-px flex-none"><Icon name="info" size={14} /></span>
      <span class="whitespace-pre-wrap">{block.error || "The turn failed."}</span>
    </div>
  {/if}
</div>

<style>
  .mc-caret {
    display: inline-block;
    width: 7px;
    height: 1em;
    margin-left: 2px;
    background: var(--accent-tx);
    vertical-align: text-bottom;
    border-radius: 1px;
    animation: blink 1s steps(2) infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .mc-caret {
      animation: none;
    }
  }
</style>
