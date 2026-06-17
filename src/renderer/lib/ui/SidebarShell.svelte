<!--
  SidebarShell — the shared window frame for the primary screens (Home, Settings).
  Owns the chrome so it can never drift between views:
    · full-width titlebar (drag region + centered brand + traffic-light spacer)
    · left <aside> (brand row + caller's middle content + footer button)
    · right content column (caller renders its own <main>)

  Callers pass the variable bits:
    - brandCaption  — mono caption beside the wordmark ("agent" / "settings")
    - footerIcon/footerLabel/onfooter — the single footer action button
    - {#snippet sidebar()} — middle column content (between brand and footer)
    - {#snippet main()}    — right column (renders its own <main>)
-->
<script lang="ts">
import type { Snippet } from "svelte";
import Icon from "./Icon.svelte";

interface Props {
  /** Footer button. */
  footerIcon: string;
  footerLabel: string;
  onfooter: () => void;
  /** Sidebar middle content (rendered as direct flex children of <aside>). */
  sidebar: Snippet;
  /** Right-hand content column (renders its own <main>). */
  main: Snippet;
}

let { footerIcon, footerLabel, onfooter, sidebar, main }: Props = $props();
</script>

<div class="absolute inset-0 overflow-hidden bg-canvas" style="display:grid;grid-template-rows:var(--tbh) 1fr">

  <!-- ═══════════════════════════ TITLEBAR ═══════════════════════════════════ -->
  <header
    class="mc-drag relative z-20 flex items-center gap-[10px] border-b border-line bg-chrome px-2 pl-[14px]"
    style="grid-row:1"
    aria-label="Title bar"
  >
    <!-- Reserve space for the native macOS traffic lights overlaid here -->
    <div class="mac-traffic-spacer flex-none" aria-hidden="true"></div>

    <!-- brand (centered) -->
    <div class="pointer-events-none absolute left-1/2 -translate-x-1/2">
      <span class="text-[12.5px] font-bold tracking-[-0.01em]">mineco</span>
    </div>

    <div class="flex-1"></div>
  </header>

  <!-- ═══════════════════════════ BODY ═══════════════════════════════════════ -->
  <div style="grid-row:2;display:grid;grid-template-columns:var(--sbw) 1fr;min-height:0">

    <!-- ─────────────────────── SIDEBAR ────────────────────────────────────── -->
    <aside class="flex min-h-0 flex-col gap-3 border-r border-line bg-chrome px-3 py-[14px]">

      <!-- Brand mark -->
      <div class="flex items-center gap-[9px] px-1 pb-0 pt-0.5">
        <img src="/brand/mineco.png" alt="mineco" class="size-[30px] rounded-[8px]" />
        <span class="text-[15px] font-bold tracking-[-0.01em]">mineco</span>
      </div>

      {@render sidebar()}

      <!-- Footer action -->
      <button
        type="button"
        onclick={onfooter}
        class="mc-no-drag mt-auto flex cursor-pointer items-center gap-[9px] rounded-[0_0_8px_8px] border-none border-t border-line bg-transparent px-[9px] py-[11px] text-[12.5px] text-ink-2 transition-colors hover:bg-chrome-2 hover:text-ink"
        aria-label={footerLabel}
      >
        <Icon name={footerIcon} size={13} stroke={1.8} class="text-ink-3" />
        {footerLabel}
      </button>
    </aside>

    <!-- ─────────────────────── CONTENT COLUMN ─────────────────────────────── -->
    {@render main()}

  </div><!-- /body grid -->
</div><!-- /window -->
