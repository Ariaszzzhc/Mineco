<!--
  Card — the bordered container used everywhere in settings views.
  Renders a div with the standard card surface (bg-card border border-line
  rounded-[var(--r-card)] overflow-hidden) wrapping a `children` snippet.
  An optional `class` prop is appended so callers can add extra layout classes
  (e.g. `flex flex-col`, `mt-2`) without losing the base styles.
-->
<script lang="ts">
import type { Snippet } from "svelte";

let {
  class: className = "",
  children,
}: {
  class?: string;
  children: Snippet;
} = $props();
</script>

<div class="bg-card border border-line rounded-[var(--r-card)] overflow-hidden {className}">
  {@render children()}
</div>
