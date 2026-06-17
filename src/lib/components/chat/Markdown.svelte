<!--
  Markdown — renders a string of (GFM) markdown as sanitized HTML. Used for the
  assistant's streamed prose. Two `Marked` instances are held at module scope:

    - mdStream: plain GFM parse, no syntax highlighting. Used while a turn is
      streaming so we never re-highlight the whole block on every token (which
      would be O(n²) over the turn). Prose still re-parses live — marked is sync
      and sub-ms for typical message sizes.
    - mdFinal:  same parse + highlight.js on fenced code. Engaged once the turn
      settles, so code is highlighted exactly once. A brief "settle" of color at
      turn-end is expected and common in chat UIs.

  The highlighted HTML is run through DOMPurify before {@html}: agent output can
  echo untrusted file/web content (a prompt-injection surface), so the rendered
  tree must be stripped of scripts / iframes / event handlers. DOMPurify's
  default allow-list keeps `class` (needed for the hljs-* token spans) and the
  standard prose tags.

  Copy buttons are injected into each <pre> via a post-render $effect that only
  runs when the turn is not streaming. External link clicks are routed to the
  system browser by the main process (setWindowOpenHandler + will-navigate), so
  we render plain <a> tags and don't need a custom link renderer here.
-->
<script lang="ts">
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";

let {
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
} = $props();

/** Highlight one fenced block. Known language → exact; otherwise best-effort. */
function highlightCode(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    return hljs.highlight(code, { language: lang }).value;
  }
  return hljs.highlightAuto(code).value;
}

// `langPrefix: "hljs language-"` puts both `hljs` (base palette) and
// `language-<lang>` on the <code> element.
const mdStream = new Marked({ gfm: true, breaks: false });
const mdFinal = new Marked(
  { gfm: true, breaks: false },
  markedHighlight({ langPrefix: "hljs language-", highlight: highlightCode }),
);

const html = $derived.by(() => {
  if (!text) return "";
  const out = (streaming ? mdStream : mdFinal).parse(text) as string;
  return DOMPurify.sanitize(out);
});

let container = $state<HTMLDivElement | null>(null);

// Attach a copy button to each fenced block once the turn settles. Re-runs when
// `html`/`streaming` change; idempotent (skips <pre>s that already have one) and
// cheap while streaming (early return). Svelte 5 runs $effect after the DOM
// update, so the latest <pre>s are visible here.
$effect(() => {
  // track dependencies explicitly
  void html;
  void streaming;
  const root = container;
  if (streaming || !root) return;
  for (const pre of root.querySelectorAll<HTMLPreElement>("pre")) {
    if (pre.querySelector(".mc-copy")) continue;
    const code = pre.querySelector("code");
    if (!code) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mc-copy";
    btn.setAttribute("aria-label", "Copy code");
    btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code.textContent ?? "");
        btn.textContent = "Copied";
        btn.dataset.copied = "1";
        window.setTimeout(() => {
          btn.textContent = "Copy";
          delete btn.dataset.copied;
        }, 1200);
      } catch {
        /* clipboard unavailable — ignore */
      }
    });
    pre.appendChild(btn);
  }
});
</script>

{#if text}
  <div class="mc-md max-w-[64ch] text-[14.5px] leading-[1.62] text-ink [text-wrap:pretty]" bind:this={container}>{@html html}</div>
{/if}
