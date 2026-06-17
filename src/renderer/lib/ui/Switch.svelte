<!--
  Switch — thin styled wrapper over bits-ui Switch.

  Props:
    checked?  : boolean ($bindable)
    disabled? : boolean
    label?    : string  — accessible label (visually hidden unless `children`)
    onCheckedChange? : (checked: boolean) => void
    children? : Snippet — optional visible label rendered beside the track

  Accent-tinted track when on; uses --accent so it tracks the user's accent.
-->
<script lang="ts">
import { Switch } from "bits-ui";
import type { Snippet } from "svelte";

let {
  checked = $bindable(false),
  disabled = false,
  label = "",
  onCheckedChange,
  children,
}: {
  checked?: boolean;
  disabled?: boolean;
  label?: string;
  onCheckedChange?: (checked: boolean) => void;
  children?: Snippet;
} = $props();
</script>

<label class="inline-flex items-center gap-2 select-none">
  <Switch.Root
    bind:checked
    {disabled}
    aria-label={label || undefined}
    {onCheckedChange}
    class="mc-no-drag relative inline-flex h-[20px] w-[34px] shrink-0 cursor-pointer items-center rounded-full border border-line-3 bg-raised transition-colors outline-none data-[state=checked]:border-accent-ln data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent-ln"
  >
    <Switch.Thumb
      class="pointer-events-none block size-[14px] translate-x-[3px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[17px]"
    />
  </Switch.Root>
  {#if children}
    <span class="text-[13px] text-ink">{@render children()}</span>
  {/if}
</label>
