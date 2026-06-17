<!--
  ThinkBlock — renders a turn's reasoning. While the turn is still streaming
  reasoning (and no prose text has started) it shows a live "Thinking…" header
  with the reasoning streaming below. Once the turn moves on (text started, or
  turn finished) it folds to a clickable "Thought for Ns" pill that toggles the
  reasoning open/closed. Mirrors the prototype's ThinkBlock7 (t7-think*).
-->
<script lang="ts">
import { i18n } from "@/renderer/lib/stores/i18n.svelte";
import Icon from "@/renderer/lib/ui/Icon.svelte";
let {
  text,
  live = false,
  durationMs = 0,
}: {
  /** Concatenated reasoning text for the turn. */
  text: string;
  /** True while reasoning is actively streaming and no prose has begun. */
  live?: boolean;
  /** Total reasoning duration in ms (for the folded pill label). */
  durationMs?: number;
} = $props();

let open = $state(false);

const durationLabel = $derived(
  durationMs >= 1000
    ? `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)}s`
    : `${Math.max(1, Math.round(durationMs / 100) * 100 || 1)}ms`,
);
</script>

{#if live}
  <!-- live streaming reasoning -->
  <div
    class="flex flex-col items-start gap-1.5 [animation:p-rise_.4s_cubic-bezier(.2,.7,.3,1)_both]"
  >
    <div
      class="inline-flex items-center gap-[7px] font-mono text-[10px] font-semibold uppercase tracking-[.09em] text-ink-3"
    >
      <Icon name="think" size={13} />
      <span class="mc-think-live">{i18n.t("thinking")}…</span>
    </div>
    <p
      class="m-0 max-w-[62ch] border-l-2 border-line-3 py-px pl-3.5 text-[13px] leading-[1.62] text-ink-2 [text-wrap:pretty] whitespace-pre-wrap"
    >
      {text}<span class="mc-caret"></span>
    </p>
  </div>
{:else if text.trim()}
  <!-- folded pill, expandable -->
  <div class="flex flex-col items-start gap-1.5">
    <button
      type="button"
      onclick={() => (open = !open)}
      title={open ? "Hide reasoning" : "Show reasoning"}
      class="mc-no-drag inline-flex items-center gap-[7px] whitespace-nowrap rounded-[var(--r-field)] border border-line-2 bg-chrome-2 px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[.06em] text-ink-3 outline-none transition-colors hover:bg-card hover:text-ink-2 [animation:p-rise_.4s_cubic-bezier(.2,.7,.3,1)_both]"
    >
      <Icon name="think" size={13} />
      Thought for {durationLabel}
      <span
        class="grid place-items-center transition-transform duration-200"
        class:rotate-180={open}
      >
        <Icon name="chev" size={11} />
      </span>
    </button>
    {#if open}
      <p
        class="m-0 max-w-[62ch] border-l-2 border-line-3 py-px pl-3.5 text-[13px] leading-[1.62] text-ink-2 [text-wrap:pretty] whitespace-pre-wrap [animation:p-rise_.3s_cubic-bezier(.2,.7,.3,1)_both]"
      >
        {text}
      </p>
    {/if}
  </div>
{/if}

<style>
  .mc-think-live {
    background: linear-gradient(
      90deg,
      var(--ink-3) 38%,
      var(--ink) 50%,
      var(--ink-3) 62%
    );
    background-size: 220% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    animation: sheen 1.8s linear infinite;
  }
  .mc-caret {
    display: inline-block;
    width: 6px;
    height: 1em;
    margin-left: 2px;
    background: var(--ink-3);
    vertical-align: text-bottom;
    border-radius: 1px;
    animation: blink 1s steps(2) infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .mc-think-live {
      animation: none;
      color: var(--ink-3);
      background: none;
      -webkit-text-fill-color: var(--ink-3);
    }
    .mc-caret {
      animation: none;
    }
  }
</style>
