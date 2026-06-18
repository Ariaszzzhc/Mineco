<!--
  Dropdown — thin styled wrapper over bits-ui DropdownMenu for a simple
  single-select / action menu.

  Props:
    open?       : boolean ($bindable)
    items       : { value: string; label: string; disabled?: boolean }[]
    value?      : string  ($bindable) — currently selected value (optional;
                  when provided, the selected item shows a check)
    side?,align?,sideOffset? : positioning (defaults bottom/start/6)
    class?      : extra classes for the menu panel
    trigger     : Snippet — the clickable trigger content
    onselect?   : (value: string) => void

  For richer menus, compose bits-ui DropdownMenu directly; this covers the
  common "click trigger -> pick one row" case used by the composer selects.
-->
<script lang="ts">
import { DropdownMenu } from "bits-ui";
import type { Snippet } from "svelte";

type Item = { value: string; label: string; disabled?: boolean };
type Side = "top" | "right" | "bottom" | "left";
type Align = "start" | "center" | "end";

let {
  open = $bindable(false),
  items,
  value = $bindable<string | undefined>(undefined),
  side = "bottom" as Side,
  align = "start" as Align,
  sideOffset = 6,
  class: className = "",
  trigger,
  onselect,
}: {
  open?: boolean;
  items: Item[];
  value?: string;
  side?: Side;
  align?: Align;
  sideOffset?: number;
  class?: string;
  trigger: Snippet;
  onselect?: (value: string) => void;
} = $props();

function pick(v: string) {
  value = v;
  onselect?.(v);
}
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger class="mc-no-drag outline-none">
    {@render trigger()}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      {side}
      {align}
      {sideOffset}
      class={`z-50 min-w-[180px] rounded-[var(--r-card)] border border-line-3 bg-card p-1 text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,.55)] outline-none [animation:pop_.14s_cubic-bezier(.2,.7,.3,1)_both] ${className}`}
    >
      {#each items as item (item.value)}
        <DropdownMenu.Item
          textValue={item.label}
          disabled={item.disabled}
          onSelect={() => pick(item.value)}
          class="flex cursor-default select-none items-center gap-2 rounded-[var(--r-field)] px-2.5 py-1.5 text-[13px] text-ink outline-none data-highlighted:bg-card-2 data-disabled:opacity-40 data-disabled:pointer-events-none"
        >
          <span
            class="grid size-3.5 place-items-center text-accent-tx"
            aria-hidden="true"
          >
            {#if value === item.value}✓{/if}
          </span>
          {item.label}
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
