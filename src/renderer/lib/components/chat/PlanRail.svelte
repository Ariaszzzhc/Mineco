<!--
  PlanRail — right-rail content showing a plan step checklist and optional
  subagents section. Renders nothing when both plan and subagents are
  empty/null (so the parent can hide the rail entirely).

  Header: "Plan  <done>/<total>  —" with a local collapse toggle.
  Steps: done = check + strikethrough, active = spinner ring, pending = dim.
  SUBAGENTS section (only when subagents non-empty): rows with name, summary, status.
-->
<script lang="ts">
import Icon from "@/renderer/lib/ui/Icon.svelte";
import { i18n } from "@/renderer/lib/stores/i18n.svelte";

type PlanStep = {
  id: string;
  text: string;
  status: "pending" | "active" | "done";
};

type Subagent = {
  subId: string;
  agentName: string;
  status?: "ok" | "error" | "running";
  summary?: string;
};

let {
  plan = null,
  subagents = null,
}: {
  plan?: PlanStep[] | null;
  subagents?: Subagent[] | null;
} = $props();

// Local collapse state — not stored anywhere
let collapsed = $state(false);

const hasSteps = $derived(plan != null && plan.length > 0);
const hasSubagents = $derived(subagents != null && subagents.length > 0);
const isEmpty = $derived(!hasSteps && !hasSubagents);

const doneCount = $derived(
  hasSteps ? plan?.filter((s) => s.status === "done").length : 0,
);
const totalCount = $derived(hasSteps ? plan?.length : 0);
</script>

{#if !isEmpty}
  <div class="flex flex-col gap-0 rounded-[var(--r-panel)] border border-line bg-card overflow-hidden">
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2.5 border-b border-line-2">
      <span class="flex-none text-ink-2">
        <Icon name="plan" size={13} stroke={2} />
      </span>
      <span class="flex-1 text-[12px] font-semibold text-ink tracking-tight">
        {i18n.t("plan.title")}
      </span>
      {#if hasSteps}
        <span
          class="rounded-full bg-card-2 border border-line-2 px-1.5 py-px font-mono text-[10px] font-semibold text-ink-2 tabular-nums"
        >
          {doneCount}/{totalCount}
        </span>
      {/if}
      <button
        type="button"
        onclick={() => (collapsed = !collapsed)}
        title={collapsed ? "Expand" : "Collapse"}
        class="mc-no-drag grid size-5 flex-none place-items-center rounded-[var(--r-field)] text-ink-3 transition-colors hover:bg-card-2 hover:text-ink-2 outline-none"
        aria-expanded={!collapsed}
      >
        <span
          class="grid place-items-center transition-transform duration-200"
          class:rotate-180={collapsed}
        >
          <Icon name="chev" size={11} stroke={2} />
        </span>
      </button>
    </div>

    {#if !collapsed}
      <div class="flex flex-col gap-0 px-2 py-2">
        <!-- Plan steps -->
        {#if hasSteps}
          <div class="flex flex-col gap-0.5">
            {#each plan! as step (step.id)}
              <div
                class="flex items-start gap-2 rounded-[var(--r-field)] px-1.5 py-1.5"
                class:opacity-40={step.status === "pending"}
              >
                <!-- Status indicator -->
                <span class="mt-px grid size-3.5 flex-none place-items-center">
                  {#if step.status === "done"}
                    <span class="text-accent-tx">
                      <Icon name="check" size={12} stroke={2.6} />
                    </span>
                  {:else if step.status === "active"}
                    <span class="mc-spin"></span>
                  {:else}
                    <!-- pending: dim circle outline -->
                    <span class="block size-2.5 rounded-full border border-line-3"></span>
                  {/if}
                </span>
                <!-- Step text -->
                <span
                  class="text-[12px] leading-[1.5] text-ink-2"
                  class:line-through={step.status === "done"}
                  class:text-ink-3={step.status === "done"}
                  class:text-ink={step.status === "active"}
                >
                  {step.text}
                </span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Subagents section -->
        {#if hasSubagents}
          <div class="mt-2 flex flex-col gap-0.5">
            <div
              class="px-1.5 pb-1 font-mono text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-3"
            >
              {i18n.t("plan.subagents")}
            </div>
            {#each subagents! as sa (sa.subId)}
              <div
                class="flex items-center gap-2 rounded-[var(--r-field)] px-1.5 py-1.5"
              >
                <!-- Status dot -->
                <span class="flex-none">
                  {#if sa.status === "running"}
                    <span class="mc-spin-sm"></span>
                  {:else if sa.status === "ok"}
                    <span class="block size-1.5 rounded-full bg-ok"></span>
                  {:else if sa.status === "error"}
                    <span class="block size-1.5 rounded-full bg-del"></span>
                  {:else}
                    <span class="block size-1.5 rounded-full bg-line-3 opacity-60"></span>
                  {/if}
                </span>
                <!-- Agent name -->
                <span class="flex-none text-[12px] font-medium text-ink">
                  {sa.agentName}
                </span>
                <!-- Summary + status label -->
                {#if sa.summary || sa.status}
                  <span class="truncate text-[11px] text-ink-3">
                    {#if sa.summary}{sa.summary}{/if}{#if sa.summary && sa.status} · {/if}{#if sa.status}<span
                        class:text-ok={sa.status === "ok"}
                        class:text-del={sa.status === "error"}
                        class:text-accent-tx={sa.status === "running"}
                      >{sa.status}</span>{/if}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .mc-spin {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid color-mix(in oklab, var(--accent) 30%, transparent);
    border-top-color: var(--accent-tx);
    animation: spin 0.7s linear infinite;
  }
  .mc-spin-sm {
    display: block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1.5px solid color-mix(in oklab, var(--accent) 30%, transparent);
    border-top-color: var(--accent-tx);
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .mc-spin,
    .mc-spin-sm {
      animation: none;
    }
  }
</style>
