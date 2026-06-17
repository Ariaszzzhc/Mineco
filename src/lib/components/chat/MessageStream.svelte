<!--
  MessageStream — renders the ordered list of user bubbles and assistant blocks
  for a session. Pure presentational: the parent (Chat.svelte) owns the blocks
  array and mutation. User messages are right-aligned accent bubbles; assistant
  turns delegate to AssistantBlock.
-->
<script lang="ts">
import AssistantBlock from "./AssistantBlock.svelte";
import type { Block } from "./types";

let { blocks }: { blocks: Block[] } = $props();
</script>

{#each blocks as block (block.id)}
  {#if block.kind === "user"}
    <div
      class="flex max-w-[80%] flex-col items-end gap-1.5 self-end [animation:p-rise_.4s_cubic-bezier(.2,.7,.3,1)_both]"
    >
      <div class="flex items-baseline gap-2">
        <span class="text-[12px] font-bold text-ink">You</span>
        <span class="font-mono text-[10.5px] text-ink-3">{block.time}</span>
      </div>
      <div
        class="whitespace-pre-wrap rounded-[12px_12px_4px_12px] bg-accent px-[15px] py-[11px] text-[14px] leading-[1.5] text-white"
      >
        {block.text}
      </div>
    </div>
  {:else}
    <AssistantBlock {block} />
  {/if}
{/each}
