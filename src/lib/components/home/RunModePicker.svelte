<!--
  RunModePicker — toolbar button that opens a popover to pick the run mode
  (Default / Plan / Auto / Accept edits). Each mode has a distinct accent color.
  The selected mode is persisted to localStorage (keyed by workspace id).
-->
<script lang="ts">
import { i18n } from "../../stores/i18n.svelte";
import Icon from "../../ui/Icon.svelte";
import { Popover } from "bits-ui";
import type { EngineId, RunMode } from "../../agent-protocol";

interface Props {
  mode: RunMode;
  engine: EngineId;
  onchange: (m: RunMode) => void;
}
let { mode, engine, onchange }: Props = $props();

let open = $state(false);

// Each run mode gets a color + icon + label
const MODE_META: Record<
  RunMode,
  { color: string; icon: string; desc: string }
> = {
  default: {
    color: "#5566C9",
    icon: "sparkle",
    desc: "Edits and runs commands; asks when unsure",
  },
  plan: {
    color: "#C9890F",
    icon: "plan",
    desc: "Researches and plans first — no edits until you approve",
  },
  auto: {
    color: "#D9608C",
    icon: "bolt",
    desc: "Full autonomy — edits, runs and commits without pausing",
  },
  acceptEdits: {
    color: "#3E9B4F",
    icon: "shield",
    desc: "Pauses for your review before every file edit",
  },
};

const modeLabel: Record<RunMode, string> = {
  default: "runMode.default",
  plan: "runMode.plan",
  auto: "runMode.auto",
  acceptEdits: "runMode.acceptEdits",
};

function pick(m: RunMode) {
  onchange(m);
  open = false;
}

const availableModes = $derived(
  (window.mineco?.runModes?.(engine) ?? [
    "default",
    "plan",
    "auto",
  ]) as RunMode[],
);

const meta = $derived(MODE_META[mode] ?? MODE_META.default);
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class="mc-no-drag inline-flex h-[26px] cursor-pointer items-center gap-[5px] rounded-[7px] border-none px-[9px] font-[var(--ui)] text-[11.5px] font-semibold outline-none transition-[filter] hover:brightness-95"
    style={`color:${meta.color};background:color-mix(in oklab, ${meta.color} 14%, transparent)`}
    title={i18n.t("runMode")}
  >
    <span class="inline-flex">
      <Icon name={meta.icon} size={13} stroke={1.8} />
    </span>
    {i18n.t(modeLabel[mode])}
    <span class="inline-flex opacity-85">
      <Icon name="chev" size={11} stroke={2.4} />
    </span>
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content
      side="top"
      align="start"
      sideOffset={8}
      class="z-50 min-w-[250px] rounded-[11px] border border-line-3 bg-card p-[6px] shadow-[0_18px_48px_-16px_rgba(20,18,14,.45)] outline-none [animation:pop_.16s_cubic-bezier(.2,.8,.3,1)_both]"
    >
      <div class="px-[9px] pb-[5px] pt-[7px] font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-ink-3">
        {i18n.t("runMode")}
      </div>

      {#each availableModes as m (m)}
        {@const mm = MODE_META[m] ?? MODE_META.default}
        {@const isSel = m === mode}
        <button
          type="button"
          onclick={() => pick(m)}
          class="flex w-full cursor-pointer items-center gap-[10px] rounded-[8px] border-none bg-transparent px-[9px] py-[8px] text-left font-[var(--ui)] transition-colors hover:bg-card-2"
        >
          <span
            class="grid size-[26px] flex-none place-items-center rounded-[7px]"
            style:background={`color-mix(in oklab, ${mm.color} 16%, var(--card-2))`}
            style:color={mm.color}
          >
            <Icon name={mm.icon} size={15} stroke={1.8} />
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-px">
            <span class="text-[13px] font-[500] text-ink">{i18n.t(modeLabel[m])}</span>
            <span class="text-[11.5px] leading-snug text-ink-3">{mm.desc}</span>
          </span>
          <span class={`flex-none text-accent-tx transition-opacity ${isSel ? "opacity-100" : "opacity-0"}`}>
            <Icon name="check" size={15} stroke={2.6} />
          </span>
        </button>
      {/each}

      <div class="mx-[3px] mt-[5px] border-t border-line px-[9px] py-[7px] text-[11px] text-ink-3">
        <kbd class="rounded-[4px] border border-line bg-card-2 px-[4px] py-px font-mono text-[10px]">⇧⇥</kbd>
        &nbsp;cycles modes from the composer
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
