<!--
  Settings — full-screen three-panel shell:
    · Custom titlebar (mac traffic-lights + win controls)
    · Left sidebar: section nav (5 items) + "Back to agent" footer
    · Right: scrollable content that swaps out the active section

  Sections: Agents / MCP servers / Skills / Memory / Appearance
  All data is persisted via window.mineco; no fake seed data.
-->
<script lang="ts">
import { nav } from "../stores/nav.svelte";
import { i18n } from "../stores/i18n.svelte";
import Icon from "../ui/Icon.svelte";
import AgentsView from "../components/settings/AgentsView.svelte";
import McpView from "../components/settings/McpView.svelte";
import SkillsView from "../components/settings/SkillsView.svelte";
import MemoryView from "../components/settings/MemoryView.svelte";
import AppearanceView from "../components/settings/AppearanceView.svelte";

type Section = "agents" | "mcp" | "skills" | "memory" | "appearance";

let activeSection = $state<Section>("agents");
let scrollEl = $state<HTMLElement | null>(null);

const sections: {
  id: Section;
  labelKey: string;
  sub: string;
  icon: string;
}[] = [
  {
    id: "agents",
    labelKey: "settings.agents",
    sub: "Engines · models · prompt",
    icon: "bot",
  },
  {
    id: "mcp",
    labelKey: "settings.mcp",
    sub: "External tools",
    icon: "plug",
  },
  {
    id: "skills",
    labelKey: "settings.skills",
    sub: "Capability packs",
    icon: "skill",
  },
  {
    id: "memory",
    labelKey: "settings.memory",
    sub: "Per-workspace",
    icon: "brain",
  },
  {
    id: "appearance",
    labelKey: "settings.appearance",
    sub: "Theme · window · language",
    icon: "paint",
  },
];

function setSection(id: Section) {
  activeSection = id;
  if (scrollEl) scrollEl.scrollTop = 0;
}

function handleBack() {
  nav.back();
}
</script>

<!-- Root: full-window absolute -->
<div class="absolute inset-0 bg-app overflow-hidden flex">

  <!-- ============================================================
       Titlebar (drag region, on top of sidebar + content)
       ============================================================ -->
  <div
    class="mc-drag absolute top-0 left-0 right-0 h-[var(--tbh)] z-30 flex items-center"
    style="background: var(--chrome);"
  >
    <!-- macOS traffic lights (left) -->
    <div class="mac-controls items-center gap-1.5 pl-4 flex-none" aria-label="Window controls">
      <button class="mc-no-drag w-[13px] h-[13px] rounded-full bg-[#FF5F57] border border-[rgba(0,0,0,.12)] flex items-center justify-center group" title="Close">
        <span class="opacity-0 group-hover:opacity-100 transition-opacity">
          <Icon name="close" size={7} stroke={1.1} />
        </span>
      </button>
      <button class="mc-no-drag w-[13px] h-[13px] rounded-full bg-[#FFBD2E] border border-[rgba(0,0,0,.12)] flex items-center justify-center group" title="Minimize">
        <span class="opacity-0 group-hover:opacity-100 transition-opacity">
          <Icon name="minimize" size={7} stroke={1.1} />
        </span>
      </button>
      <button class="mc-no-drag w-[13px] h-[13px] rounded-full bg-[#28C840] border border-[rgba(0,0,0,.12)] flex items-center justify-center group" title="Zoom">
        <span class="opacity-0 group-hover:opacity-100 transition-opacity">
          <Icon name="maximize" size={7} />
        </span>
      </button>
    </div>

    <!-- Brand -->
    <div class="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
      <span class="font-ui font-semibold text-[13px] text-ink">{i18n.t("app.name")}</span>
      <span class="font-mono text-[10px] text-ink-3 uppercase tracking-widest">settings</span>
    </div>

    <div class="flex-1"></div>

    <!-- Windows controls (right) -->
    <div class="win-controls items-center flex-none pr-1" aria-label="Window controls">
      <button class="mc-no-drag w-[46px] h-[var(--tbh)] flex items-center justify-center text-ink-2 hover:bg-card-2 transition-colors" title="Minimize">
        <Icon name="minimize" size={11} stroke={1.2} />
      </button>
      <button class="mc-no-drag w-[46px] h-[var(--tbh)] flex items-center justify-center text-ink-2 hover:bg-card-2 transition-colors" title="Maximize">
        <Icon name="maximize" size={11} stroke={1.2} />
      </button>
      <button class="mc-no-drag w-[46px] h-[var(--tbh)] flex items-center justify-center text-ink-2 hover:bg-[#E81123] hover:text-white transition-colors" title="Close">
        <Icon name="close" size={11} stroke={1.2} />
      </button>
    </div>
  </div>

  <!-- ============================================================
       Sidebar
       ============================================================ -->
  <aside
    class="absolute top-0 bottom-0 left-0 flex flex-col z-20"
    style="width: var(--sbw); background: var(--chrome); border-right: 1px solid var(--line);"
  >
    <!-- Brand row (inside sidebar, below titlebar) -->
    <div
      class="mc-drag flex items-center gap-2.5 px-4 flex-none"
      style="height: var(--tbh); border-bottom: 1px solid var(--line);"
    >
      <img src="/brand/mineco.png" alt="mineco" class="w-[22px] h-[22px] rounded-[7px] object-cover" />
      <span class="font-ui font-semibold text-[13px] text-ink">mineco</span>
      <span class="font-mono text-[10px] text-ink-3">settings</span>
    </div>

    <!-- Nav items -->
    <nav class="flex flex-col gap-0.5 p-3 flex-1 min-h-0 overflow-y-auto">
      {#each sections as s (s.id)}
        <button
          type="button"
          onclick={() => setSection(s.id)}
          class="mc-no-drag flex items-center gap-2.5 text-left border-none cursor-pointer px-2.5 py-2 rounded-[var(--r-field)] font-ui font-semibold text-[13px] transition-colors {activeSection === s.id
            ? 'bg-card-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]'
            : 'bg-transparent text-ink-2 hover:bg-chrome-2'}"
        >
          <span
            class="w-[26px] h-[26px] flex-none rounded-[7px] grid place-items-center border transition-colors {activeSection === s.id
              ? 'bg-accent-bg border-accent-ln text-accent-tx'
              : 'bg-raised border-line text-ink-2'}"
          >
            <Icon name={s.icon} size={14} />
          </span>
          <span class="flex flex-col">
            {i18n.t(s.labelKey)}
            <span class="block font-medium text-[10.5px] text-ink-3 leading-tight">{s.sub}</span>
          </span>
        </button>
      {/each}
    </nav>

    <!-- Sidebar footer — "Back to agent" -->
    <div class="flex-none p-3 border-t border-line">
      <button
        type="button"
        onclick={handleBack}
        class="mc-no-drag flex items-center gap-2 w-full text-left border-none bg-transparent cursor-pointer text-ink-2 font-ui font-semibold text-[12.5px] px-2.5 py-2 rounded-[var(--r-field)] hover:bg-chrome-2 hover:text-ink transition-colors"
      >
        <Icon name="back" size={13} class="text-ink-3" />
        {i18n.t("nav.back")} to agent
      </button>
    </div>
  </aside>

  <!-- ============================================================
       Scrollable content area
       ============================================================ -->
  <main
    bind:this={scrollEl}
    class="absolute top-[var(--tbh)] bottom-0 right-0 overflow-y-auto mc-scroll bg-canvas"
    style="left: var(--sbw);"
  >
    <div class="max-w-[720px] mx-auto px-9 pt-9 pb-20 flex flex-col gap-4">
      {#if activeSection === "agents"}
        <AgentsView />
      {:else if activeSection === "mcp"}
        <McpView />
      {:else if activeSection === "skills"}
        <SkillsView />
      {:else if activeSection === "memory"}
        <MemoryView />
      {:else if activeSection === "appearance"}
        <AppearanceView />
      {/if}
    </div>
  </main>
</div>
