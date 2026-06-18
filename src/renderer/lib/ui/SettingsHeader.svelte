<!--
  SettingsHeader — the page-level header repeated at the top of all settings
  views. Renders a flex row: the title/desc block on the left and an optional
  actions snippet on the right (e.g. the "New agent" button in AgentsView).

  Props:
    title    : string  — large bold page title (h1)
    desc?    : Snippet — description paragraph; use a snippet (not a string)
                         because it may contain inline <code>, interpolated
                         counts, or <strong> markup.
    actions? : Snippet — optional trailing content (button, etc.) placed on
                         the same baseline row via `flex items-end gap-3`.

  Layout mirrors the hand-written wrappers in each settings view exactly:
  `flex items-end gap-3` outer, `flex-1 min-w-0` title block, `flex-none`
  actions. AppearanceView's `mb-3` is handled by passing `class` on the outer
  wrapper — SettingsHeader's own outer div carries no margin so each view can
  add its own via a wrapping element if needed.
-->
<script lang="ts">
import type { Snippet } from "svelte";

let {
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: Snippet;
  actions?: Snippet;
} = $props();
</script>

<div class="flex items-end gap-3">
  <div class="flex-1 min-w-0">
    <h1 class="m-0 font-bold text-[22px] leading-tight tracking-tight text-ink">
      {title}
    </h1>
    {#if desc}
      <p class="mt-1.5 text-ink-2 text-[13.5px] leading-[1.55] max-w-[60ch]">
        {@render desc()}
      </p>
    {/if}
  </div>
  {#if actions}
    <div class="flex-none">
      {@render actions()}
    </div>
  {/if}
</div>
