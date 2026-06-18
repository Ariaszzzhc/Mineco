<!--
  CardHeader — the standard icon + title row at the top of a card.
  Renders: border-b border-line row with a 13px accent-colored Icon, a bold
  title span, and an optional `trailing` snippet (rendered after the title,
  typically with `ml-auto` classes applied by the caller).

  Props:
    icon     : string  — Icon name
    title    : string  — header label text
    trailing?: Snippet — optional content after the title (token count, role
                         label, "advanced" badge, etc.)

  Non-standard headers (collapsible buttons, different icon colors) should NOT
  use this component — leave them as plain markup.
-->
<script lang="ts">
import type { Snippet } from "svelte";
import Icon from "./Icon.svelte";

let {
  icon,
  title,
  trailing,
}: {
  icon: string;
  title: string;
  trailing?: Snippet;
} = $props();
</script>

<div class="flex items-center gap-2.5 px-4 py-[11px] border-b border-line">
  <Icon name={icon} size={13} class="text-accent-tx" />
  <span class="font-[650] text-[12.5px] text-ink">{title}</span>
  {#if trailing}
    {@render trailing()}
  {/if}
</div>
