<!--
  Popover — thin styled wrapper over bits-ui Popover.

  Props:
    open?      : boolean  ($bindable) controlled open state
    side?      : 'top' | 'right' | 'bottom' | 'left'   (default 'bottom')
    align?     : 'start' | 'center' | 'end'            (default 'start')
    sideOffset?: number                                (default 6)
    class?     : extra classes for the content panel
    trigger    : Snippet — the clickable trigger content
    children   : Snippet — the popover body

  Card-styled panel: card bg, border-line-3, rounded per --r-card, pop animation.
-->
<script lang="ts">
import { Popover } from "bits-ui";
import type { Snippet } from "svelte";

type Side = "top" | "right" | "bottom" | "left";
type Align = "start" | "center" | "end";

let {
  open = $bindable(false),
  side = "bottom" as Side,
  align = "start" as Align,
  sideOffset = 6,
  class: className = "",
  trigger,
  children,
}: {
  open?: boolean;
  side?: Side;
  align?: Align;
  sideOffset?: number;
  class?: string;
  trigger: Snippet;
  children: Snippet;
} = $props();
</script>

<Popover.Root bind:open>
  <Popover.Trigger class="mc-no-drag outline-none">
    {@render trigger()}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      {side}
      {align}
      {sideOffset}
      class={`z-50 min-w-[180px] rounded-[var(--r-card)] border border-line-3 bg-card p-1 text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,.55)] outline-none [animation:pop_.14s_cubic-bezier(.2,.7,.3,1)_both] ${className}`}
    >
      {@render children()}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
