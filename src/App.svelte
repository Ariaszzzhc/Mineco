<script lang="ts">
import { onMount } from "svelte";
import type {
  EngineId,
  NormalizedUsage,
  ProviderProfile,
  Session,
} from "./lib/agent-protocol";

type Turn = {
  id: number;
  prompt: string;
  engineLabel: string;
  reasoning: string;
  text: string;
  tools: string[];
  usage: NormalizedUsage | null;
  status: "running" | "done" | "error";
};

let profiles = $state<ProviderProfile[]>([]);
let activeProfileId = $state("");
let session = $state<Session | null>(null);

let prompt = $state("");
let turns = $state<Turn[]>([]);
let busy = $state(false);
let nextId = 0;

// Provider config form.
let showConfig = $state(false);
let form = $state({
  name: "",
  engine: "claude" as EngineId,
  model: "",
  apiKey: "",
  baseUrl: "",
});

onMount(async () => {
  profiles = await window.mineco.profiles.list();
  if (profiles.length) activeProfileId = profiles[0].id;
  else showConfig = true;

  const sessions = await window.mineco.sessions.list();
  session = sessions[0] ?? (await window.mineco.sessions.create());
});

async function addProfile() {
  if (!form.name.trim() || !form.model.trim()) return;
  const created = await window.mineco.profiles.create({ ...form });
  profiles = [...profiles, created];
  activeProfileId = created.id;
  form = { name: "", engine: "claude", model: "", apiKey: "", baseUrl: "" };
  showConfig = false;
}

async function removeProfile(id: string) {
  await window.mineco.profiles.remove(id);
  profiles = profiles.filter((p) => p.id !== id);
  if (activeProfileId === id) activeProfileId = profiles[0]?.id ?? "";
}

function run() {
  const text = prompt.trim();
  const profile = profiles.find((p) => p.id === activeProfileId);
  if (!text || busy || !profile || !session) return;

  busy = true;
  prompt = "";

  turns.push({
    id: nextId++,
    prompt: text,
    engineLabel: `${profile.name} · ${profile.engine}`,
    reasoning: "",
    text: "",
    tools: [],
    usage: null,
    status: "running",
  });
  // Grab the reactive proxy back out of the $state array — mutating this
  // (not the literal above) is what triggers Svelte's fine-grained updates.
  const turn = turns[turns.length - 1];

  window.mineco.runTurn(
    { sessionId: session.id, profileId: profile.id, prompt: text },
    (event) => {
      switch (event.type) {
        case "reasoning":
          turn.reasoning += event.text;
          break;
        case "text":
          turn.text += event.text;
          break;
        case "tool":
          if (!turn.tools.includes(event.name)) turn.tools.push(event.name);
          break;
        case "result":
          if (!turn.text) turn.text = event.text;
          turn.usage = event.usage;
          turn.status = "done";
          busy = false;
          break;
        case "error":
          turn.text = event.message;
          turn.status = "error";
          busy = false;
          break;
      }
    },
  );
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    run();
  }
}
</script>

<main>
  <header>
    <h1>mineco · meta agent</h1>
    <button class="link" onclick={() => (showConfig = !showConfig)}>
      {showConfig ? "close" : "providers"}
    </button>
  </header>

  {#if showConfig}
    <section class="config">
      {#each profiles as p (p.id)}
        <div class="profile-row">
          <span><strong>{p.name}</strong> · {p.engine} · {p.model}</span>
          <button class="link" onclick={() => removeProfile(p.id)}>remove</button>
        </div>
      {/each}
      <div class="form">
        <input placeholder="name" bind:value={form.name} />
        <select bind:value={form.engine}>
          <option value="claude">claude</option>
          <option value="codex">codex</option>
        </select>
        <input placeholder="model" bind:value={form.model} />
        <input placeholder="api key" type="password" bind:value={form.apiKey} />
        <input placeholder="base url (optional)" bind:value={form.baseUrl} />
        <button onclick={addProfile}>Add provider</button>
      </div>
    </section>
  {/if}

  <div class="log">
    {#each turns as turn (turn.id)}
      <div class="turn">
        <p class="user">▸ {turn.prompt}</p>
        <p class="engine">{turn.engineLabel}</p>
        {#if turn.reasoning}
          <pre class="reasoning">{turn.reasoning}</pre>
        {/if}
        {#if turn.tools.length}
          <p class="tools">tools: {turn.tools.join(", ")}</p>
        {/if}
        <pre class="reply" class:error={turn.status === "error"}>{turn.text}{#if turn.status === "running"}<span class="cursor">▍</span>{/if}</pre>
        {#if turn.usage}
          <p class="usage">
            in {turn.usage.inputTokens} · out {turn.usage.outputTokens}{#if turn.usage.costUsd != null} · ${turn.usage.costUsd.toFixed(4)}{/if}
          </p>
        {/if}
      </div>
    {/each}
    {#if !turns.length}
      <p class="empty">
        {profiles.length
          ? "Pick a provider and ask the agent. Switch providers between turns — the conversation carries over."
          : "Add a provider (claude or codex) to get started."}
      </p>
    {/if}
  </div>

  <div class="composer">
    <select bind:value={activeProfileId} disabled={!profiles.length || busy}>
      {#each profiles as p (p.id)}
        <option value={p.id}>{p.name} · {p.engine}</option>
      {/each}
    </select>
    <textarea
      bind:value={prompt}
      onkeydown={onKeydown}
      placeholder="Type a prompt, Enter to send…"
      rows="2"
      disabled={busy || !profiles.length}
    ></textarea>
    <button onclick={run} disabled={busy || !prompt.trim() || !activeProfileId}>
      {busy ? "…" : "Send"}
    </button>
  </div>
</main>

<style>
  main {
    max-width: 820px;
    margin: 0 auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }
  h1 {
    font-size: 1rem;
    margin: 0;
    color: #888;
  }
  .link {
    background: none;
    border: none;
    color: #6aa6ff;
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
  .config {
    border: 1px solid #333;
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .profile-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
  }
  .form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .form input,
  .form select {
    font: inherit;
    padding: 0.35rem;
    flex: 1 1 8rem;
  }
  .log {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .turn {
    border-left: 2px solid #333;
    padding-left: 0.75rem;
  }
  .user {
    margin: 0 0 0.15rem;
    font-weight: 600;
  }
  .engine {
    margin: 0 0 0.25rem;
    font-size: 0.75rem;
    color: #6aa6ff;
  }
  .tools {
    margin: 0 0 0.25rem;
    font-size: 0.8rem;
    color: #999;
  }
  .reasoning {
    margin: 0 0 0.4rem;
    padding: 0.4rem;
    background: #1a1a1a;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-word;
    font: inherit;
    font-size: 0.8rem;
    color: #999;
  }
  .reply {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font: inherit;
  }
  .reply.error {
    color: #e06c75;
  }
  .usage {
    margin: 0.25rem 0 0;
    font-size: 0.75rem;
    color: #777;
  }
  .empty {
    color: #888;
  }
  .cursor {
    animation: blink 1s step-end infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  .composer {
    display: flex;
    gap: 0.5rem;
    padding-top: 0.75rem;
    align-items: flex-start;
  }
  .composer select {
    font: inherit;
    padding: 0.35rem;
    max-width: 12rem;
  }
  textarea {
    flex: 1;
    resize: none;
    font: inherit;
    padding: 0.5rem;
  }
  .composer > button {
    padding: 0 1rem;
  }
</style>
