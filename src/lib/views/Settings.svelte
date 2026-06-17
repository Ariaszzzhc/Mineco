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
import SidebarShell from "../ui/SidebarShell.svelte";
import SidebarRow from "../ui/SidebarRow.svelte";
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
    sub: "Theme · language",
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

<SidebarShell
  footerIcon="back"
  footerLabel={`${i18n.t("nav.back")} to agent`}
  onfooter={handleBack}
>
  <!-- ─────────────────────── SIDEBAR: section nav ───────────────────────── -->
  {#snippet sidebar()}
    <nav class="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto">
      {#each sections as s (s.id)}
        <SidebarRow
          icon={s.icon}
          title={i18n.t(s.labelKey)}
          subtitle={s.sub}
          active={activeSection === s.id}
          onclick={() => setSection(s.id)}
        />
      {/each}
    </nav>
  {/snippet}

  <!-- ─────────────────────── SCROLLABLE CONTENT ─────────────────────────── -->
  {#snippet main()}
    <main
      bind:this={scrollEl}
      class="relative min-h-0 overflow-y-auto mc-scroll bg-canvas"
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
  {/snippet}
</SidebarShell>
