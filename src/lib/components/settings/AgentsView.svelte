<!--
  AgentsView — lists agents, supports inline "New agent" menu that opens a
  full-page editor. Wires every change to window.mineco.agents.*
-->
<script lang="ts">
import Icon from "../../ui/Icon.svelte";
import Segmented from "../../ui/Segmented.svelte";
import { onMount } from "svelte";
import type { Agent, AgentInput, EngineId } from "../../agent-protocol";
import { i18n } from "../../stores/i18n.svelte";

// ---- local state ----
let agents = $state<Agent[]>([]);
let editAgent = $state<Agent | null>(null);
let showMenu = $state(false);

// ---- debounce helper ----
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debounce(fn: () => void, ms = 400) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, ms);
}

onMount(async () => {
  agents = (await window.mineco.agents.list()) ?? [];
});

// ---- add agent ----
async function addAgent(engine: EngineId) {
  showMenu = false;
  const input: AgentInput = {
    engine,
    name: engine === "claude" ? "New Claude Code agent" : "New Codex agent",
    baseUrl:
      engine === "claude"
        ? "https://api.anthropic.com"
        : "https://api.openai.com/v1",
    apiKey: "",
    models: {
      sonnet: "claude-sonnet-4-5",
      opus: "claude-opus-4-5",
      haiku: "claude-haiku-4-5",
    },
    model: "gpt-5-codex",
    effort: "medium",
    systemPrompt: "",
    promptMode: "append",
  };
  const created = await window.mineco.agents.create(input);
  agents = [...agents, created];
  editAgent = created;
}

// ---- delete agent ----
async function deleteAgent(id: string) {
  await window.mineco.agents.remove(id);
  agents = agents.filter((a) => a.id !== id);
  editAgent = null;
}

// ---- update agent ----
function patchAgent(patch: Partial<Agent>) {
  if (!editAgent) return;
  const updated = { ...editAgent, ...patch } as Agent;
  editAgent = updated;
  // sync into list
  const idx = agents.findIndex((a) => a.id === updated.id);
  if (idx !== -1) agents[idx] = updated;
  debounce(() => {
    window.mineco.agents.update(updated);
  });
}

function patchModels(role: keyof Agent["models"], model: string) {
  if (!editAgent) return;
  patchAgent({ models: { ...editAgent.models, [role]: model } });
}

// ---- back from detail ----
function goBack() {
  editAgent = null;
}

// Engine label / badge helper
function engineLabel(e: EngineId) {
  return e === "claude" ? "Claude Code" : "Codex";
}
function engineImg(e: EngineId) {
  return e === "claude" ? "/brand/claude-icon.png" : "/brand/codex-icon.png";
}

// Token estimate
function tokenEstimate(text: string) {
  return Math.max(1, Math.round(text.length / 3.7));
}

// reveal/hide state
let showKey = $state(false);

// Effort options
const effortOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

// Prompt mode options
const promptModeOptions = [
  { value: "append", label: i18n.t("agent.promptMode.append") },
  { value: "replace", label: i18n.t("agent.promptMode.replace") },
];

// Model aliases for Claude
const CLAUDE_ALIASES: { id: keyof Agent["models"]; sub: string }[] = [
  { id: "sonnet", sub: "default · main agent" },
  { id: "opus", sub: "deep reasoning" },
  { id: "haiku", sub: "fast · subagents" },
];

const CLAUDE_MODELS = [
  "claude-sonnet-4-5",
  "claude-opus-4-5",
  "claude-haiku-4-5",
  "claude-3-5-sonnet-20241022",
  "claude-3-opus-20240229",
  "claude-3-haiku-20240307",
];

const CODEX_MODELS = ["gpt-5-codex", "gpt-5-codex-mini", "gpt-5", "o4-mini"];

// copy to clipboard
async function copyKey() {
  if (!editAgent?.apiKey) return;
  await navigator.clipboard.writeText(editAgent.apiKey);
}
</script>

<!-- ======================================================= LIST VIEW ======= -->
{#if !editAgent}
  <div class="flex items-end gap-3">
    <div class="flex-1 min-w-0">
      <h1 class="m-0 font-bold text-[22px] leading-tight tracking-tight text-ink">
        {i18n.t("settings.agents")}
      </h1>
      <p class="mt-1.5 text-ink-2 text-[13.5px] leading-[1.55] max-w-[60ch]">
        mineco is a host — it drives an underlying coding engine. Each agent is a
        <code class="text-ink font-mono text-[12px]">Claude Code</code> (Claude Agent SDK) or
        <code class="text-ink font-mono text-[12px]">Codex</code> (Codex Agent SDK) setup with its own
        endpoint, models, and standing instructions. Pick which one to run from the composer in chat.
      </p>
    </div>

    <!-- New agent dropdown -->
    <div class="relative flex-none">
      <button
        type="button"
        onclick={() => (showMenu = !showMenu)}
        class="mc-no-drag inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--r-field)] border border-line-3 bg-card-2 text-ink text-[12.5px] font-semibold hover:bg-raised transition-colors"
      >
        <Icon name="plus" size={13} />
        {i18n.t("agent.new")}
      </button>

      {#if showMenu}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute top-[calc(100%+6px)] right-0 z-20 min-w-[184px] bg-card border border-line rounded-[var(--r-card)] shadow-[0_12px_32px_-12px_rgba(0,0,0,.5)] p-1 flex flex-col gap-0.5 [animation:pop_.14s_cubic-bezier(.2,.7,.3,1)_both]"
          onmouseleave={() => (showMenu = false)}
        >
          <button
            type="button"
            onclick={() => addAgent("claude")}
            class="flex items-center gap-2.5 w-full text-left border-none bg-transparent cursor-pointer rounded-[var(--r-field)] px-2.5 py-2 font-ui font-semibold text-[12.5px] text-ink hover:bg-card-2 transition-colors"
          >
            <span class="w-6 h-6 rounded-[7px] overflow-hidden border-none bg-transparent flex-none">
              <img src="/brand/claude-icon.png" alt="" class="w-full h-full object-cover block" />
            </span>
            Claude Code
          </button>
          <button
            type="button"
            onclick={() => addAgent("codex")}
            class="flex items-center gap-2.5 w-full text-left border-none bg-transparent cursor-pointer rounded-[var(--r-field)] px-2.5 py-2 font-ui font-semibold text-[12.5px] text-ink hover:bg-card-2 transition-colors"
          >
            <span class="w-6 h-6 rounded-[7px] overflow-hidden border-none bg-transparent flex-none">
              <img src="/brand/codex-icon.png" alt="" class="w-full h-full object-cover block" />
            </span>
            Codex
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if agents.length === 0}
    <!-- empty state -->
    <div class="bg-card border border-line rounded-[var(--r-card)] p-8 text-center flex flex-col items-center gap-3">
      <div class="w-10 h-10 rounded-[12px] bg-raised border border-line grid place-items-center text-ink-3">
        <Icon name="bot" size={20} />
      </div>
      <p class="text-ink-2 text-[13px] m-0">{i18n.t("empty.noAgents")}</p>
      <button
        type="button"
        onclick={() => (showMenu = true)}
        class="mc-no-drag inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--r-field)] border border-accent-ln bg-accent-bg text-accent-tx text-[12.5px] font-semibold"
      >
        <Icon name="plus" size={13} />
        {i18n.t("empty.noAgentsCta")}
      </button>
    </div>
  {:else}
    <!-- agent list card -->
    <div class="bg-card border border-line rounded-[var(--r-card)] overflow-hidden">
      <div class="flex flex-col">
        {#each agents as agent (agent.id)}
          {@const summary = agent.engine === "codex"
            ? `${agent.model} · ${agent.effort} effort`
            : `${agent.models.sonnet} · 3 aliases`}
          <button
            type="button"
            onclick={() => { editAgent = agent; showKey = false; }}
            class="mc-no-drag flex items-center gap-3 px-4 py-3 border-t border-line first:border-t-0 cursor-pointer bg-transparent hover:bg-card-2 transition-colors text-left w-full"
          >
            <span class="w-[30px] h-[30px] flex-none rounded-[9px] overflow-hidden border-none bg-transparent">
              <img src={engineImg(agent.engine)} alt={engineLabel(agent.engine)} class="w-full h-full object-cover block" />
            </span>
            <span class="flex flex-col flex-1 min-w-0">
              <span class="font-[650] text-[13px] text-ink">{agent.name}</span>
              <span class="font-mono text-[10.5px] text-ink-3 truncate">{agent.baseUrl} · {summary}</span>
            </span>
            <span class="font-mono text-[9.5px] font-semibold tracking-widest uppercase text-ink-2 bg-card-2 border border-line px-[7px] py-[2px] rounded-full flex-none">
              {agent.engine === "codex" ? "codex" : "cc"}
            </span>
            <span class="text-ink-3 flex-none">
              <Icon name="chevR" size={14} />
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="flex items-start gap-2 text-[12px] text-ink-2 leading-[1.5] px-1">
    <Icon name="info" size={14} class="text-ink-3 flex-none mt-[2px]" />
    Configure your agents here; pick which one runs a session from the composer in chat.
  </div>

<!-- ======================================================= DETAIL VIEW ====== -->
{:else}
  {@const agent = editAgent}

  <button
    type="button"
    onclick={goBack}
    class="mc-no-drag self-start inline-flex items-center gap-1.5 border-none bg-transparent cursor-pointer text-ink-2 font-ui font-semibold text-[12.5px] px-2 py-1 rounded-[7px] mb-[-2px] hover:bg-chrome-2 hover:text-ink transition-colors"
  >
    <Icon name="back" size={14} class="text-ink-3" />
    All agents
  </button>

  <!-- detail header -->
  <div class="flex items-center gap-3 px-0.5 pb-0.5">
    <span class="w-[42px] h-[42px] flex-none rounded-[12px] overflow-hidden border-none bg-transparent">
      <img src={engineImg(agent.engine)} alt={engineLabel(agent.engine)} class="w-full h-full object-cover block" />
    </span>
    <div class="flex-1 min-w-0 flex flex-col gap-0.5">
      <input
        type="text"
        value={agent.name}
        spellcheck="false"
        aria-label={i18n.t("agent.name")}
        oninput={(e) => patchAgent({ name: (e.target as HTMLInputElement).value })}
        class="mc-no-drag border border-transparent bg-transparent outline-none text-ink font-ui font-bold text-[20px] tracking-tight rounded-[8px] px-2 py-0.5 mx-[-7px] hover:bg-card-2 focus:bg-card-2 focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_20%,transparent)] transition-colors"
      />
      <span class="font-mono text-[11px] text-ink-3 pl-0.5">{engineLabel(agent.engine)} · {agent.engine === "claude" ? "Claude Agent SDK" : "Codex Agent SDK"}</span>
    </div>
  </div>

  <!-- Connection card -->
  <div class="bg-card border border-line rounded-[var(--r-card)] overflow-hidden">
    <div class="flex items-center gap-2.5 px-4 py-[11px] border-b border-line">
      <Icon name="key" size={13} class="text-accent-tx" />
      <span class="font-[650] text-[12.5px] text-ink">Connection</span>
    </div>
    <div class="grid grid-cols-2 gap-3 p-4">
      <!-- Base URL (full width) -->
      <div class="col-span-2 flex flex-col gap-1.5">
        <label for="agent-base-url" class="font-mono text-[10px] font-semibold tracking-[.06em] uppercase text-ink-3">{i18n.t("agent.baseUrl")}</label>
        <div class="flex items-center gap-1.5 bg-card-2 border border-line rounded-[var(--r-field)] px-3 h-[34px] focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)] transition-all">
          <input
            id="agent-base-url"
            type="text"
            value={agent.baseUrl}
            spellcheck="false"
            oninput={(e) => patchAgent({ baseUrl: (e.target as HTMLInputElement).value })}
            class="flex-1 min-w-0 border-none outline-none bg-transparent font-mono text-[12px] text-ink h-full"
          />
        </div>
      </div>
      <!-- API key (full width) -->
      <div class="col-span-2 flex flex-col gap-1.5">
        <label for="agent-api-key" class="font-mono text-[10px] font-semibold tracking-[.06em] uppercase text-ink-3">{i18n.t("agent.apiKey")}</label>
        <div class="flex items-center gap-1 bg-card-2 border border-line rounded-[var(--r-field)] px-3 h-[34px] focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)] transition-all">
          <input
            id="agent-api-key"
            type={showKey ? "text" : "password"}
            value={agent.apiKey}
            placeholder="paste token…"
            spellcheck="false"
            oninput={(e) => patchAgent({ apiKey: (e.target as HTMLInputElement).value })}
            class="flex-1 min-w-0 border-none outline-none bg-transparent font-mono text-[12px] text-ink h-full"
          />
          <button
            type="button"
            title={showKey ? "Hide" : "Reveal"}
            onclick={() => (showKey = !showKey)}
            class="mc-no-drag w-[26px] h-[26px] flex-none border-none rounded-[7px] bg-transparent text-ink-3 cursor-pointer grid place-items-center hover:bg-raised hover:text-ink transition-colors"
          >
            <Icon name={showKey ? "eyeOff" : "eye"} size={14} />
          </button>
          <button
            type="button"
            title="Copy"
            onclick={copyKey}
            class="mc-no-drag w-[26px] h-[26px] flex-none border-none rounded-[7px] bg-transparent text-ink-3 cursor-pointer grid place-items-center hover:bg-raised hover:text-ink transition-colors"
          >
            <Icon name="copy" size={13} />
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Model card -->
  <div class="bg-card border border-line rounded-[var(--r-card)] overflow-hidden">
    <div class="flex items-center gap-2.5 px-4 py-[11px] border-b border-line">
      <Icon name="sparkle" size={13} class="text-accent-tx" />
      <span class="font-[650] text-[12.5px] text-ink">
        {agent.engine === "codex" ? "Model" : "Model mapping"}
      </span>
      <span class="ml-auto font-mono text-[10.5px] text-ink-3">
        {agent.engine === "codex" ? "Codex Agent SDK" : "SDK alias → model"}
      </span>
    </div>

    <div class="flex flex-col gap-2 px-4 py-3.5">
      {#if agent.engine === "claude"}
        {#each CLAUDE_ALIASES as al (al.id)}
          <div class="grid items-center gap-2.5" style="grid-template-columns: 158px 1fr;">
            <span class="flex flex-col gap-0.5">
              <strong class="font-mono font-[650] text-[12.5px] text-ink">{al.id}</strong>
              <span class="text-[10px] text-ink-3">{al.sub}</span>
            </span>
            <div class="relative flex items-center bg-card-2 border border-line rounded-[var(--r-field)] px-3 h-[34px] focus-within:border-accent transition-all">
              <select
                value={agent.models[al.id]}
                onchange={(e) => patchModels(al.id, (e.target as HTMLSelectElement).value)}
                class="mc-no-drag flex-1 min-w-0 border-none outline-none bg-transparent font-mono text-[12px] text-ink h-full appearance-none cursor-pointer pr-5"
              >
                {#each CLAUDE_MODELS as m (m)}
                  <option value={m}>{m}</option>
                {/each}
              </select>
              <span class="absolute right-2 text-ink-3 pointer-events-none">
                <Icon name="chev" size={12} />
              </span>
            </div>
          </div>
        {/each}
      {:else}
        <!-- Codex: single model + effort -->
        <div class="grid items-center gap-2.5" style="grid-template-columns: 158px 1fr;">
          <span class="flex flex-col gap-0.5">
            <strong class="font-mono font-[650] text-[12.5px] text-ink">model</strong>
            <span class="text-[10px] text-ink-3">the codex model</span>
          </span>
          <div class="relative flex items-center bg-card-2 border border-line rounded-[var(--r-field)] px-3 h-[34px] focus-within:border-accent transition-all">
            <select
              value={agent.model}
              onchange={(e) => patchAgent({ model: (e.target as HTMLSelectElement).value })}
              class="mc-no-drag flex-1 min-w-0 border-none outline-none bg-transparent font-mono text-[12px] text-ink h-full appearance-none cursor-pointer pr-5"
            >
              {#each CODEX_MODELS as m (m)}
                <option value={m}>{m}</option>
              {/each}
            </select>
            <span class="absolute right-2 text-ink-3 pointer-events-none">
              <Icon name="chev" size={12} />
            </span>
          </div>
        </div>
        <div class="grid items-center gap-2.5" style="grid-template-columns: 158px 1fr;">
          <span class="flex flex-col gap-0.5">
            <strong class="font-mono font-[650] text-[12.5px] text-ink">reasoning</strong>
            <span class="text-[10px] text-ink-3">effort / token budget</span>
          </span>
          <Segmented
            bind:value={agent.effort}
            options={effortOptions}
            size="sm"
            onchange={(v) => patchAgent({ effort: v as Agent["effort"] })}
          />
        </div>
      {/if}
    </div>
  </div>

  <!-- System prompt card -->
  <div class="bg-card border border-line rounded-[var(--r-card)] overflow-hidden flex flex-col">
    <div class="flex items-center gap-2.5 px-4 py-[11px] border-b border-line">
      <Icon name="prompt" size={13} class="text-accent-tx" />
      <span class="font-[650] text-[12.5px] text-ink">{i18n.t("agent.systemPrompt")}</span>
      <span class="ml-auto font-mono text-[10.5px] text-ink-3">~{tokenEstimate(agent.systemPrompt)} tokens</span>
    </div>
    <!-- mode row -->
    <div class="flex items-center gap-3 px-4 py-2.5 border-b border-line">
      <Segmented
        bind:value={agent.promptMode}
        options={promptModeOptions}
        size="sm"
        onchange={(v) => patchAgent({ promptMode: v as Agent["promptMode"] })}
      />
      <span class="text-ink-3 text-[11px] ml-auto">
        {agent.promptMode === "append" ? "SDK preset + yours" : "yours only — tool guidance lost"}
      </span>
    </div>
    <textarea
      value={agent.systemPrompt}
      spellcheck="false"
      placeholder="Standing instructions for this agent…"
      oninput={(e) => patchAgent({ systemPrompt: (e.target as HTMLTextAreaElement).value })}
      class="mc-no-drag w-full min-h-[222px] border-none outline-none resize-y px-4 py-3.5 bg-chrome font-mono text-[12px] leading-[1.7] text-ink"
    ></textarea>
  </div>

  <!-- Danger zone -->
  <div class="flex justify-end py-0.5">
    <button
      type="button"
      onclick={() => deleteAgent(agent.id)}
      class="mc-no-drag inline-flex items-center gap-2 cursor-pointer border px-3.5 py-2 rounded-[var(--r-field)] font-ui font-semibold text-[12px] transition-colors"
      style="border-color: color-mix(in oklab, var(--del) 35%, transparent); background: color-mix(in oklab, var(--del) 10%, transparent); color: var(--del);"
    >
      <Icon name="trash" size={13} />
      {i18n.t("delete")} agent
    </button>
  </div>
{/if}
