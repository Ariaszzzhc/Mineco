<!--
  AgentPicker — the chip in the composer scope row that opens a Popover listing
  available agents. Emits onselect(agent) when the user picks one.
-->
<script lang="ts">
import { i18n } from "../../stores/i18n.svelte";
import { nav } from "../../stores/nav.svelte";
import Icon from "../../ui/Icon.svelte";
import { Popover } from "bits-ui";
import type { Agent } from "../../agent-protocol";

interface Props {
  agents: Agent[];
  selected: Agent | null;
  onselect: (a: Agent) => void;
}
let { agents, selected, onselect }: Props = $props();

let open = $state(false);

function pick(a: Agent) {
  onselect(a);
  open = false;
}

function engineIcon(engine: string): string {
  return engine === "claude" ? "sdkA" : "sdkX";
}

function agentSub(a: Agent): string {
  if (a.engine === "claude") {
    return `Claude Code · ${a.models?.sonnet ?? a.model ?? ""}`;
  }
  return `Codex · ${a.model ?? ""}`;
}
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class="mc-no-drag inline-flex cursor-pointer items-center gap-[7px] rounded-[8px] border border-line bg-card px-[10px] py-0 text-[12px] font-semibold text-ink h-7 transition-colors hover:border-line-3 hover:bg-card-2 outline-none pl-[5px]"
    title={i18n.t("agent")}
  >
    {#if selected}
      <!-- engine icon badge -->
      <span class="grid size-[19px] flex-none place-items-center rounded-[6px] bg-accent-bg text-accent-tx">
        <Icon name={engineIcon(selected.engine)} size={12} stroke={1.8} />
      </span>
      <span>{selected.name}</span>
    {:else}
      <Icon name="bot" size={15} stroke={1.8} class="text-ink-2" />
      <span class="text-ink-2">{i18n.t("empty.noAgentsCta")}</span>
    {/if}
    <span class="text-ink-3">
      <Icon name="chev" size={11} stroke={2.4} />
    </span>
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content
      side="top"
      align="end"
      sideOffset={6}
      class="z-50 min-w-[260px] rounded-[11px] border border-line-3 bg-card p-[6px] shadow-[0_18px_48px_-16px_rgba(20,18,14,.45)] outline-none [animation:pop_.16s_cubic-bezier(.2,.8,.3,1)_both]"
    >
      <div class="px-[9px] pb-[5px] pt-[7px] font-mono text-[10px] font-semibold uppercase tracking-[.1em] text-ink-3">
        {i18n.t("agent")} — which engine runs this session
      </div>

      {#if agents.length === 0}
        <div class="px-[9px] py-[8px] text-[12px] text-ink-3">
          {i18n.t("empty.noAgents")}
        </div>
      {:else}
        {#each agents as agent (agent.id)}
          {@const isSel = agent.id === selected?.id}
          <button
            type="button"
            onclick={() => pick(agent)}
            class="flex w-full cursor-pointer items-center gap-[10px] rounded-[8px] border-none bg-transparent px-[9px] py-[8px] text-left font-[var(--ui)] transition-colors hover:bg-card-2"
          >
            <span class={`grid size-[26px] flex-none place-items-center rounded-[7px] ${isSel ? "bg-accent-bg text-accent-tx" : "bg-card-2 text-ink-2"}`}>
              <Icon name={engineIcon(agent.engine)} size={15} stroke={1.8} />
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-px">
              <span class="text-[13px] font-[500] text-ink">{agent.name}</span>
              <span class="text-[11.5px] leading-snug text-ink-3">{agentSub(agent)}</span>
            </span>
            <span class={`flex-none text-accent transition-opacity ${isSel ? "opacity-100" : "opacity-0"}`}>
              <Icon name="check" size={15} stroke={2.6} />
            </span>
          </button>
        {/each}
      {/if}

      <div class="mx-[3px] mt-[5px] border-t border-line px-[9px] py-[7px] text-[11px] text-ink-3">
        Manage agents in
        <button
          type="button"
          onclick={() => { open = false; nav.openSettings(); }}
          class="cursor-pointer border-none bg-transparent p-0 font-semibold text-ink underline underline-offset-2 font-[var(--ui)] text-[11px]"
        >
          Settings
        </button>
      </div>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
