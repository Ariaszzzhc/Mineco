<!--
  AppearanceView — binds to the theme store (single source of truth).
  Controls: Theme (Dark/Light), Accent swatches, Window controls,
  Font size, Interface language. Each calls theme.set() which persists + applies.
-->
<script lang="ts">
import type { AppInfo } from "@/shared/agent-protocol";
import { i18n } from "@/renderer/lib/stores/i18n.svelte";
import Icon from "@/renderer/lib/ui/Icon.svelte";
import Card from "@/renderer/lib/ui/Card.svelte";
import CardHeader from "@/renderer/lib/ui/CardHeader.svelte";
import SettingsHeader from "@/renderer/lib/ui/SettingsHeader.svelte";
import Segmented from "@/renderer/lib/ui/Segmented.svelte";
import { theme } from "@/renderer/lib/stores/theme.svelte";

const ACCENTS = ["#43A95A", "#D6A33C", "#8E7BE6", "#3B82C4", "#D9608C"];

// Reactively read from the theme store
const currentTheme = $derived(theme.theme);
const currentAccent = $derived(theme.accent);
const currentLang = $derived(theme.lang);

// App/runtime version — read once from the main process (static for the run).
let info = $state<AppInfo | null>(null);
$effect(() => {
  void window.mineco.app.getInfo().then((i) => {
    info = i;
  });
});
</script>

<div class="mb-3">
  <SettingsHeader title={i18n.t("settings.appearance")}>
    {#snippet desc()}
      How the mineco shell looks on this machine. Applies across all three surfaces — Home, the session view and Settings.
    {/snippet}
  </SettingsHeader>
</div>

<!-- Theme & color card -->
<Card>
  <CardHeader icon="paint" title="Theme & color" />

  <!-- Theme row -->
  <div class="flex items-center gap-4 px-4 py-3.5 border-b border-line">
    <span class="flex-1 min-w-0 flex flex-col gap-0.5">
      <span class="font-[650] text-[13px] text-ink">{i18n.t("theme")}</span>
      <span class="text-[11.5px] text-ink-3 leading-[1.4]">Dark, or the warm-white light tone</span>
    </span>
    <div class="flex gap-1.5">
      <button
        type="button"
        onclick={() => theme.set({ theme: "dark" })}
        class="mc-no-drag inline-flex items-center gap-1.5 cursor-pointer border rounded-[var(--r-field)] px-3.5 py-[7px] font-ui font-semibold text-[12.5px] transition-colors {currentTheme === 'dark'
          ? 'bg-accent-bg text-accent-tx border-accent-ln'
          : 'border-line bg-card-2 text-ink-2 hover:bg-raised hover:text-ink'}"
      >
        <Icon name="moon" size={14} />
        {i18n.t("theme.dark")}
      </button>
      <button
        type="button"
        onclick={() => theme.set({ theme: "light" })}
        class="mc-no-drag inline-flex items-center gap-1.5 cursor-pointer border rounded-[var(--r-field)] px-3.5 py-[7px] font-ui font-semibold text-[12.5px] transition-colors {currentTheme === 'light'
          ? 'bg-accent-bg text-accent-tx border-accent-ln'
          : 'border-line bg-card-2 text-ink-2 hover:bg-raised hover:text-ink'}"
      >
        <Icon name="sun" size={14} />
        {i18n.t("theme.light")}
      </button>
    </div>
  </div>

  <!-- Accent row -->
  <div class="flex items-center gap-4 px-4 py-3.5">
    <span class="flex-1 min-w-0 flex flex-col gap-0.5">
      <span class="font-[650] text-[13px] text-ink">{i18n.t("accent")}</span>
      <span class="text-[11.5px] text-ink-3 leading-[1.4]">Used for fills, selection and highlights</span>
    </span>
    <div class="flex gap-2 flex-none">
      {#each ACCENTS as color (color)}
        <button
          type="button"
          title={color}
          onclick={() => theme.set({ accent: color })}
          class="mc-no-drag w-7 h-7 rounded-[9px] border-2 cursor-pointer grid place-items-center shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)] transition-all hover:-translate-y-px {currentAccent === color
            ? 'border-canvas shadow-[0_0_0_2px_var(--canvas),0_0_0_4px_var(--ink-2)]'
            : 'border-transparent'}"
          style="background: {color};"
        >
          {#if currentAccent === color}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.5l4 4 10-10.5" />
            </svg>
          {/if}
        </button>
      {/each}
    </div>
  </div>
</Card>

<!-- Interface language card -->
<Card>
  <CardHeader icon="globe" title="Interface language" />

  <div class="flex items-center gap-4 px-4 py-3.5">
    <span class="flex-1 min-w-0 flex flex-col gap-0.5">
      <span class="font-[650] text-[13px] text-ink">{i18n.t("language")}</span>
      <span class="text-[11.5px] text-ink-3 leading-[1.4]">Menus, buttons and labels of the mineco shell</span>
    </span>
    <Segmented
      value={currentLang}
      options={[
        { value: "en", label: i18n.t("lang.en") },
        { value: "zh", label: i18n.t("lang.zh") },
      ]}
      onchange={(v) => theme.set({ lang: v as "en" | "zh" })}
    />
  </div>
</Card>

<div class="flex items-start gap-2 text-[12px] text-ink-2 leading-[1.5] px-1">
  <Icon name="info" size={14} class="text-ink-3 flex-none mt-[2px]" />
  Interface language localizes mineco itself only. What language the <strong class="text-ink-2">engine</strong> thinks and replies in is decided by the engine at runtime — it is not controlled by this setting.
</div>

<!-- About card -->
<Card>
  <CardHeader icon="info" title="About" />

  <div class="flex items-center gap-4 px-4 py-3.5 border-b border-line">
    <span class="flex-1 min-w-0 flex flex-col gap-0.5">
      <span class="font-[650] text-[13px] text-ink">mineco</span>
      <span class="text-[11.5px] text-ink-3 leading-[1.4]">Desktop agent host</span>
    </span>
    <span class="font-mono text-[12.5px] text-ink-2 tabular-nums">
      v{info?.version ?? "—"}
    </span>
  </div>

  <div class="flex items-center gap-4 px-4 py-3.5">
    <span class="flex-1 min-w-0 flex flex-col gap-0.5">
      <span class="font-[650] text-[13px] text-ink">Runtime</span>
      <span class="text-[11.5px] text-ink-3 leading-[1.4]">Electron · Node · Chromium</span>
    </span>
    <span class="font-mono text-[11.5px] text-ink-3 tabular-nums">
      {info ? `${info.electron} · ${info.node} · ${info.chrome}` : "—"}
    </span>
  </div>
</Card>
