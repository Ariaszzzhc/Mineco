<script lang="ts">
  type Turn = {
    id: number;
    prompt: string;
    text: string;
    tools: string[];
    status: "running" | "done" | "error";
  };

  let prompt = $state("");
  let turns = $state<Turn[]>([]);
  let busy = $state(false);
  let nextId = 0;

  function run() {
    const text = prompt.trim();
    if (!text || busy) return;

    busy = true;
    prompt = "";

    turns.push({
      id: nextId++,
      prompt: text,
      text: "",
      tools: [],
      status: "running",
    });
    // Grab the reactive proxy back out of the $state array — mutating this
    // (not the literal above) is what triggers Svelte's fine-grained updates.
    const turn = turns[turns.length - 1];

    window.agent.run(text, (event) => {
      switch (event.type) {
        case "text":
          turn.text += event.text;
          break;
        case "tool":
          if (!turn.tools.includes(event.name)) turn.tools.push(event.name);
          break;
        case "done":
          if (!turn.text) turn.text = event.result;
          turn.status = "done";
          busy = false;
          break;
        case "error":
          turn.text = event.message;
          turn.status = "error";
          busy = false;
          break;
      }
    });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      run();
    }
  }
</script>

<main>
  <h1>mineco · minimal agent</h1>

  <div class="log">
    {#each turns as turn (turn.id)}
      <div class="turn">
        <p class="user">▸ {turn.prompt}</p>
        {#if turn.tools.length}
          <p class="tools">tools: {turn.tools.join(", ")}</p>
        {/if}
        <pre class="reply" class:error={turn.status === "error"}>{turn.text}{#if turn.status === "running"}<span class="cursor">▍</span>{/if}</pre>
      </div>
    {/each}
    {#if !turns.length}
      <p class="empty">Ask the agent something. It can read files in the project (Read / Glob / Grep).</p>
    {/if}
  </div>

  <div class="composer">
    <textarea
      bind:value={prompt}
      onkeydown={onKeydown}
      placeholder="Type a prompt, Enter to send…"
      rows="2"
      disabled={busy}
    ></textarea>
    <button onclick={run} disabled={busy || !prompt.trim()}>
      {busy ? "…" : "Send"}
    </button>
  </div>
</main>

<style>
  main {
    max-width: 760px;
    margin: 0 auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  h1 {
    font-size: 1rem;
    margin: 0 0 0.75rem;
    color: #888;
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
    margin: 0 0 0.25rem;
    font-weight: 600;
  }
  .tools {
    margin: 0 0 0.25rem;
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
  }
  textarea {
    flex: 1;
    resize: none;
    font: inherit;
    padding: 0.5rem;
  }
  button {
    padding: 0 1rem;
  }
</style>
