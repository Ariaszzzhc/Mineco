<!--
  RunModePicker — toolbar button that opens a popover to pick the run mode.
  Modes are fetched at runtime from capabilities('claude') so they match exactly
  what the engine supports. Each known mode id gets a distinct accent color/icon.
  The selected mode is persisted to localStorage (keyed by workspace id).
-->
<script lang="ts">
import { i18n } from "../../stores/i18n.svelte";
import Icon from "../../ui/Icon.svelte";
import { Popover } from "bits-ui";
import type { EngineId, RunMode } from "../../agent-protocol";

interface Props {
  /** Current run mode id. */
  mode: string;
  engine: EngineId;
  onchange: (m: string) => void;
}
let { mode, engine, onchange }: Props = $props();

let open = $state(false);

/** Modes fetched from capabilities at runtime. */
let capModes = $state<RunMode[]>([]);

$effect(() => {
  void engine; // track
  const api = (
    globalThis as {
      mineco?: {
        capabilities?: (e: EngineId) => Promise<{ modes: RunMode[] }>;
      };
    }
  ).mineco;
  if (!api?.capabilities) {
    // Fallback while loading
    capModes = [
      {
        id: "default",
        label: "Default",
        description: "Edits and runs commands; asks when unsure",
      },
      {
        id: "plan",
        label: "Plan",
        description: "Researches and plans first — no edits until you approve",
      },
      {
        id: "auto",
        label: "Auto",
        description: "Full autonomy — edits, runs and commits without pausing",
      },
    ];
    return;
  }
  api
    .capabilities(engine)
    .then((caps) => {
      if (caps?.modes?.length) capModes = caps.modes;
    })
    .catch(() => {});
});

// Static per-id style hints (purely cosmetic; unknown ids fall back to defaults).
const MODE_STYLE: Record<string, { color: string; icon: string }> = {
  default: { color: "#5566C9", icon: "sparkle" },
  plan: { color: "#C9890F", icon: "plan" },
  auto: { color: "#D9608C", icon: "bolt" },
  acceptEdits: { color: "#3E9B4F", icon: "shield" },
};

function styleFor(id: string): { color: string; icon: string } {
  return MODE_STYLE[id] ?? { color: "#5566C9", icon: "sparkle" };
}

function pick(m: string) {
  onchange(m);
  open = false;
}

const curMode = $derived(
  capModes.find((m) => m.id === mode) ?? capModes[0] ?? null,
);
const meta = $derived(curMode ? styleFor(curMode.id) : styleFor("default"));
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
    {curMode?.label ?? mode}
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

      {#each capModes as m (m.id)}
        {@const mm = styleFor(m.id)}
        {@const isSel = m.id === mode}
        <button
          type="button"
          onclick={() => pick(m.id)}
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
            <span class="text-[13px] font-[500] text-ink">{m.label}</span>
            <span class="text-[11.5px] leading-snug text-ink-3">{m.description}</span>
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
