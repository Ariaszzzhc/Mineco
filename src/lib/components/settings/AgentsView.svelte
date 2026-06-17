<!--
  AgentsView — lists filesystem-backed agents (one dir per agent under
  ~/.mineco/engines/claude/<id>/). Supports inline editor: name, defaultModel,
  connection (baseUrl/token/model aliases), and a raw settings.json escape-hatch.
  Also hosts the Global Instructions editor (FR-21: MINECO.md appended to every
  system prompt).
-->
<script lang="ts">
import Icon from "../../ui/Icon.svelte";
import { onMount } from "svelte";
import type {
  Agent,
  AgentDetail,
  AgentInput,
  AgentConnection,
} from "../../agent-protocol";
import { i18n } from "../../stores/i18n.svelte";

// ---- local state ----
let agents = $state<Agent[]>([]);
let editAgent = $state<AgentDetail | null>(null);
/** Raw settings.json JSON text for the escape-hatch editor. */
let rawSettings = $state<string>("");
let showRaw = $state(false);
let showMenu = $state(false);

// ---- global instructions ----
let globalInstructions = $state<string>("");
let globalTokenEstimate = $state<number>(0);
let globalUpdatedAt = $state<number>(0);

// ---- reveal API key ----
let showToken = $state(false);

// ---- debounce helper ----
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debounce(fn: () => void, ms = 400) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, ms);
}

onMount(async () => {
  agents = (await window.mineco.agents.list()) ?? [];
  // Load global instructions
  try {
    const gi = await window.mineco.globalInstructions.read();
    globalInstructions = gi.text ?? "";
    globalTokenEstimate = gi.tokenEstimate ?? 0;
    globalUpdatedAt = gi.updatedAt ?? 0;
  } catch {
    /* not fatal */
  }
});

// ---- global instructions persist ----
function onGlobalInstructionsInput(text: string) {
  globalInstructions = text;
  globalTokenEstimate = Math.max(1, Math.round(text.length / 3.7));
  debounce(() => {
    window.mineco.globalInstructions.write(text).catch(() => {});
  }, 600);
}

// ---- add agent (Claude only in v1) ----
async function addAgent() {
  showMenu = false;
  const input: AgentInput = {
    name: "New Claude Code agent",
    defaultModel: "sonnet",
    connection: {
      baseUrl: "https://api.anthropic.com",
      token: "",
      models: {
        sonnet: "claude-sonnet-4-5",
        opus: "claude-opus-4-5",
        haiku: "claude-haiku-4-5",
      },
    },
  };
  try {
    const created = await window.mineco.agents.create(input);
    agents = [...agents, created];
    await openAgent(created);
  } catch (e) {
    console.error("Failed to create agent:", e);
  }
}

// ---- load detail + open editor ----
async function openAgent(a: Agent) {
  showMenu = false;
  showToken = false;
  showRaw = false;
  try {
    const detail = await window.mineco.agents.get(a.id);
    if (detail) {
      editAgent = detail;
      // Also load raw settings.json
      rawSettings = await window.mineco.agents.readSettings(a.id);
    }
  } catch (e) {
    console.error("Failed to load agent detail:", e);
  }
}

// ---- delete agent ----
async function deleteAgent(id: string) {
  try {
    await window.mineco.agents.remove(id);
    agents = agents.filter((a) => a.id !== id);
    editAgent = null;
  } catch (e) {
    console.error("Failed to delete agent:", e);
  }
}

// ---- update agent (debounced) ----
function buildInput(d: AgentDetail): AgentInput {
  return {
    name: d.name,
    defaultModel: d.defaultModel,
    connection: d.connection,
  };
}

function patchAgent(patch: Partial<AgentDetail>) {
  if (!editAgent) return;
  const updated = { ...editAgent, ...patch };
  editAgent = updated;
  // sync name into list
  const idx = agents.findIndex((a) => a.id === updated.id);
  if (idx !== -1) {
    agents[idx] = {
      ...agents[idx],
      name: editAgent.name,
      defaultModel: editAgent.defaultModel,
    };
  }
  const snap = editAgent;
  debounce(() => {
    window.mineco.agents.update(snap.id, buildInput(snap)).catch(() => {});
  });
}

function patchConnection(patch: Partial<AgentConnection>) {
  if (!editAgent) return;
  patchAgent({ connection: { ...editAgent.connection, ...patch } });
}

function patchModels(alias: keyof AgentConnection["models"], model: string) {
  if (!editAgent) return;
  patchConnection({
    models: { ...editAgent.connection.models, [alias]: model },
  });
}

// ---- raw settings.json ----
async function saveRaw() {
  if (!editAgent) return;
  try {
    await window.mineco.agents.writeSettings(editAgent.id, rawSettings);
    // Reload to get canonical shape
    const detail = await window.mineco.agents.get(editAgent.id);
    if (detail) editAgent = detail;
  } catch (e) {
    console.error("Failed to write settings:", e);
  }
}

// ---- back from detail ----
function goBack() {
  editAgent = null;
  showRaw = false;
}

// Token estimate helper
function tokenEstimate(text: string) {
  return Math.max(1, Math.round(text.length / 3.7));
}

// Alias -> suggested concrete models
const CLAUDE_MODELS = [
  "claude-sonnet-4-5",
  "claude-opus-4-5",
  "claude-haiku-4-5",
  "claude-3-5-sonnet-20241022",
  "claude-3-opus-20240229",
  "claude-3-haiku-20240307",
];

const CLAUDE_ALIASES: {
  id: keyof AgentConnection["models"];
  label: string;
  sub: string;
}[] = [
  { id: "sonnet", label: "sonnet", sub: "default · main agent" },
  { id: "opus", label: "opus", sub: "deep reasoning" },
  { id: "haiku", label: "haiku", sub: "fast · subagents" },
];

const DEFAULT_MODELS: Record<keyof AgentConnection["models"], string> = {
  sonnet: "sonnet",
  opus: "opus",
  haiku: "haiku",
};

// copy to clipboard
async function copyToken() {
  if (!editAgent?.connection.token) return;
  try {
    await navigator.clipboard.writeText(editAgent.connection.token);
  } catch {
    /* ignore */
  }
}

function fmtUpdated(ts: number): string {
  if (!ts) return "never";
  try {
    return new Date(ts).toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
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
        mineco drives Claude Code under the hood. Each agent is an isolated
        <code class="text-ink font-mono text-[12px]">CLAUDE_CONFIG_DIR</code>
        with its own credentials, model aliases, and standing instructions.
      </p>
    </div>

    <!-- New agent button -->
    <div class="relative flex-none">
      <button
        type="button"
        onclick={addAgent}
        class="mc-no-drag inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--r-field)] border border-line-3 bg-card-2 text-ink text-[12.5px] font-semibold hover:bg-raised transition-colors"
      >
        <Icon name="plus" size={13} />
        {i18n.t("agent.new")}
      </button>
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
        onclick={addAgent}
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
          <button
            type="button"
            onclick={() => openAgent(agent)}
            class="mc-no-drag flex items-center gap-3 px-4 py-3 border-t border-line first:border-t-0 cursor-pointer bg-transparent hover:bg-card-2 transition-colors text-left w-full"
          >
            <span class="w-[30px] h-[30px] flex-none rounded-[9px] overflow-hidden border-none bg-accent-bg grid place-items-center text-accent-tx">
              <img src="/brand/claude-icon.png" alt="Claude Code" class="w-full h-full object-cover block" />
            </span>
            <span class="flex flex-col flex-1 min-w-0">
              <span class="font-[650] text-[13px] text-ink">{agent.name}</span>
              <span class="font-mono text-[10.5px] text-ink-3 truncate">{agent.defaultModel} · Claude Code</span>
            </span>
            <span class="font-mono text-[9.5px] font-semibold tracking-widest uppercase text-ink-2 bg-card-2 border border-line px-[7px] py-[2px] rounded-full flex-none">
              cc
            </span>
            <span class="text-ink-3 flex-none">
              <Icon name="chevR" size={14} />
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Global Instructions card ────────────────────────────────────────── -->
  <div class="bg-card border border-line rounded-[var(--r-card)] overflow-hidden flex flex-col mt-2">
    <div class="flex items-center gap-2.5 px-4 py-[11px] border-b border-line">
      <Icon name="prompt" size={13} class="text-accent-tx" />
      <span class="font-[650] text-[12.5px] text-ink">Global Instructions</span>
      <span class="ml-auto font-mono text-[10.5px] text-ink-3">~{globalTokenEstimate} tokens</span>
      {#if globalUpdatedAt}
        <span class="font-mono text-[9.5px] text-ink-3">· updated {fmtUpdated(globalUpdatedAt)}</span>
      {/if}
    </div>
    <textarea
      value={globalInstructions}
      spellcheck="false"
      placeholder="Standing instructions injected into every system prompt (MINECO.md)…"
      oninput={(e) => onGlobalInstructionsInput((e.target as HTMLTextAreaElement).value)}
      class="mc-no-drag w-full min-h-[160px] border-none outline-none resize-y px-4 py-3.5 bg-chrome font-mono text-[12px] leading-[1.7] text-ink placeholder:text-ink-3"
    ></textarea>
    <div class="px-4 py-2 border-t border-line text-[11px] text-ink-3">
      Appended to the Claude Code system prompt preset on every turn. Stored at <code class="font-mono">~/.mineco/MINECO.md</code>.
    </div>
  </div>

  <div class="flex items-start gap-2 text-[12px] text-ink-2 leading-[1.5] px-1">
    <Icon name="info" size={14} class="text-ink-3 flex-none mt-[2px]" />
    Each agent runs in its own isolated <code class="font-mono text-[11px]">CLAUDE_CONFIG_DIR</code> — credentials and native sessions never mix.
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
    <span class="w-[42px] h-[42px] flex-none rounded-[12px] overflow-hidden border-none bg-accent-bg grid place-items-center">
      <img src="/brand/claude-icon.png" alt="Claude Code" class="w-full h-full object-cover block" />
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
      <span class="font-mono text-[11px] text-ink-3 pl-0.5">Claude Code · Claude Agent SDK</span>
      <span class="font-mono text-[10px] text-ink-3 pl-0.5 break-all">{agent.configDir}</span>
    </div>
  </div>

  <!-- Connection card -->
  <div class="bg-card border border-line rounded-[var(--r-card)] overflow-hidden">
    <div class="flex items-center gap-2.5 px-4 py-[11px] border-b border-line">
      <Icon name="key" size={13} class="text-accent-tx" />
      <span class="font-[650] text-[12.5px] text-ink">Connection</span>
    </div>
    <div class="flex flex-col gap-3 p-4">
      <!-- Base URL -->
      <div class="flex flex-col gap-1.5">
        <label for="agent-base-url" class="font-mono text-[10px] font-semibold tracking-[.06em] uppercase text-ink-3">{i18n.t("agent.baseUrl")}</label>
        <div class="flex items-center gap-1.5 bg-card-2 border border-line rounded-[var(--r-field)] px-3 h-[34px] focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)] transition-all">
          <input
            id="agent-base-url"
            type="text"
            value={agent.connection.baseUrl}
            spellcheck="false"
            oninput={(e) => patchConnection({ baseUrl: (e.target as HTMLInputElement).value })}
            class="flex-1 min-w-0 border-none outline-none bg-transparent font-mono text-[12px] text-ink h-full"
          />
        </div>
      </div>
      <!-- Auth token -->
      <div class="flex flex-col gap-1.5">
        <label for="agent-token" class="font-mono text-[10px] font-semibold tracking-[.06em] uppercase text-ink-3">Auth token (ANTHROPIC_AUTH_TOKEN)</label>
        <div class="flex items-center gap-1 bg-card-2 border border-line rounded-[var(--r-field)] px-3 h-[34px] focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)] transition-all">
          <input
            id="agent-token"
            type={showToken ? "text" : "password"}
            value={agent.connection.token}
            placeholder="sk-ant-…"
            spellcheck="false"
            oninput={(e) => patchConnection({ token: (e.target as HTMLInputElement).value })}
            class="flex-1 min-w-0 border-none outline-none bg-transparent font-mono text-[12px] text-ink h-full"
          />
          <button
            type="button"
            title={showToken ? "Hide" : "Reveal"}
            onclick={() => (showToken = !showToken)}
            class="mc-no-drag w-[26px] h-[26px] flex-none border-none rounded-[7px] bg-transparent text-ink-3 cursor-pointer grid place-items-center hover:bg-raised hover:text-ink transition-colors"
          >
            <Icon name={showToken ? "eyeOff" : "eye"} size={14} />
          </button>
          <button
            type="button"
            title="Copy"
            onclick={copyToken}
            class="mc-no-drag w-[26px] h-[26px] flex-none border-none rounded-[7px] bg-transparent text-ink-3 cursor-pointer grid place-items-center hover:bg-raised hover:text-ink transition-colors"
          >
            <Icon name="copy" size={13} />
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Model aliases card -->
  <div class="bg-card border border-line rounded-[var(--r-card)] overflow-hidden">
    <div class="flex items-center gap-2.5 px-4 py-[11px] border-b border-line">
      <Icon name="sparkle" size={13} class="text-accent-tx" />
      <span class="font-[650] text-[12.5px] text-ink">Model aliases</span>
      <span class="ml-auto font-mono text-[10.5px] text-ink-3">alias → concrete model id</span>
    </div>

    <div class="flex flex-col gap-2 px-4 py-3.5">
      <!-- Default model alias (sonnet/opus/haiku) -->
      <div class="flex flex-col gap-1.5 mb-2 pb-2 border-b border-line">
        <label for="agent-default-model" class="font-mono text-[10px] font-semibold tracking-[.06em] uppercase text-ink-3">Default model alias (composer default)</label>
        <div class="relative flex items-center bg-card-2 border border-line rounded-[var(--r-field)] px-3 h-[34px] focus-within:border-accent transition-all">
          <select
            id="agent-default-model"
            value={agent.defaultModel}
            onchange={(e) => patchAgent({ defaultModel: (e.target as HTMLSelectElement).value })}
            class="mc-no-drag flex-1 min-w-0 border-none outline-none bg-transparent font-mono text-[12px] text-ink h-full appearance-none cursor-pointer pr-5"
          >
            {#each Object.keys(DEFAULT_MODELS) as alias (alias)}
              <option value={alias}>{alias}</option>
            {/each}
          </select>
          <span class="absolute right-2 text-ink-3 pointer-events-none">
            <Icon name="chev" size={12} />
          </span>
        </div>
      </div>

      {#each CLAUDE_ALIASES as al (al.id)}
        <div class="grid items-center gap-2.5" style="grid-template-columns: 158px 1fr;">
          <span class="flex flex-col gap-0.5">
            <strong class="font-mono font-[650] text-[12.5px] text-ink">{al.label}</strong>
            <span class="text-[10px] text-ink-3">{al.sub}</span>
          </span>
          <div class="relative flex items-center bg-card-2 border border-line rounded-[var(--r-field)] px-3 h-[34px] focus-within:border-accent transition-all">
            <select
              value={agent.connection.models[al.id]}
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
    </div>
  </div>

  <!-- Raw settings.json escape-hatch -->
  <div class="bg-card border border-line rounded-[var(--r-card)] overflow-hidden flex flex-col">
    <button
      type="button"
      onclick={() => (showRaw = !showRaw)}
      class="mc-no-drag flex items-center gap-2.5 px-4 py-[11px] cursor-pointer hover:bg-card-2 transition-colors text-left w-full border-none bg-transparent"
    >
      <Icon name="code" size={13} class="text-ink-3" />
      <span class="font-[650] text-[12.5px] text-ink">settings.json (raw)</span>
      <span class="ml-auto font-mono text-[10px] text-ink-3">advanced</span>
      <span class="text-ink-3 transition-transform {showRaw ? 'rotate-180' : ''}">
        <Icon name="chev" size={12} />
      </span>
    </button>
    {#if showRaw}
      <div class="border-t border-line flex flex-col">
        <textarea
          bind:value={rawSettings}
          spellcheck="false"
          rows={14}
          class="mc-no-drag w-full border-none outline-none resize-y px-4 py-3.5 bg-chrome font-mono text-[12px] leading-[1.6] text-ink"
        ></textarea>
        <div class="flex justify-end gap-2 px-4 py-2 border-t border-line">
          <button
            type="button"
            onclick={saveRaw}
            class="mc-no-drag inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-field)] border border-accent-ln bg-accent-bg text-accent-tx text-[12px] font-semibold cursor-pointer hover:bg-accent hover:text-white transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    {/if}
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
