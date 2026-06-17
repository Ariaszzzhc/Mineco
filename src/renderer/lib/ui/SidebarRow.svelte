<!--
  SidebarRow — the shared icon-badge list row used inside SidebarShell.
  Layout: [icon badge] [title / optional subtitle]. Supports an active state
  (filled card + accent badge) and a click handler. Shared so nav-style rows
  stay visually identical wherever they appear.
-->
<script lang="ts">
import Icon from "./Icon.svelte";

interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  active?: boolean;
  onclick?: () => void;
}

let { icon, title, subtitle, active = false, onclick }: Props = $props();
</script>

<button
  type="button"
  {onclick}
  class="mc-no-drag flex items-center gap-[9px] cursor-pointer rounded-[8px] border px-[9px] py-[8px] text-left transition-colors {active
    ? 'border-line bg-card-2'
    : 'border-transparent bg-transparent hover:bg-chrome-2'}"
>
  <span
    class="size-[26px] flex-none rounded-[7px] grid place-items-center border transition-colors {active
      ? 'bg-accent-bg border-accent-ln text-accent-tx'
      : 'bg-raised border-line text-ink-2'}"
  >
    <Icon name={icon} size={14} />
  </span>
  <span class="flex min-w-0 flex-1 flex-col gap-px">
    <span class="truncate text-[12.5px] font-semibold {active ? 'text-ink' : 'text-ink-2'}">
      {title}
    </span>
    {#if subtitle}
      <span class="truncate text-[11px] text-ink-3 leading-tight">{subtitle}</span>
    {/if}
  </span>
</button>
