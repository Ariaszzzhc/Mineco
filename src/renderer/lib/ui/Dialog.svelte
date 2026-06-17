<!--
  Dialog — thin styled wrapper over bits-ui Dialog (modal).

  Props:
    open?      : boolean ($bindable)
    title?     : string  — convenience plain-text title (or use the `title` snippet)
    class?     : extra classes for the content panel
    trigger?   : Snippet — optional inline trigger; omit to open programmatically
    titleSnippet? : Snippet — rich title (overrides `title`)
    description?  : Snippet — optional description text
    children   : Snippet — dialog body

  Overlay dims + blurs; panel is card-styled, centered, with the pop animation.
-->
<script lang="ts">
import { Dialog } from "bits-ui";
import type { Snippet } from "svelte";

let {
  open = $bindable(false),
  title = "",
  class: className = "",
  trigger,
  titleSnippet,
  description,
  children,
}: {
  open?: boolean;
  title?: string;
  class?: string;
  trigger?: Snippet;
  titleSnippet?: Snippet;
  description?: Snippet;
  children: Snippet;
} = $props();
</script>

<Dialog.Root bind:open>
  {#if trigger}
    <Dialog.Trigger class="mc-no-drag outline-none">
      {@render trigger()}
    </Dialog.Trigger>
  {/if}
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] [animation:pop_.12s_ease_both]"
    />
    <Dialog.Content
      class={`fixed left-1/2 top-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--r-panel)] border border-line-3 bg-card p-5 text-ink shadow-[0_30px_80px_-30px_rgba(0,0,0,.7)] outline-none [animation:pop_.16s_cubic-bezier(.2,.7,.3,1)_both] ${className}`}
    >
      {#if titleSnippet}
        <Dialog.Title class="mb-1 text-[15px] font-semibold text-ink">
          {@render titleSnippet()}
        </Dialog.Title>
      {:else if title}
        <Dialog.Title class="mb-1 text-[15px] font-semibold text-ink">
          {title}
        </Dialog.Title>
      {/if}
      {#if description}
        <Dialog.Description class="mb-3 text-[13px] text-ink-2">
          {@render description()}
        </Dialog.Description>
      {/if}
      {@render children()}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
