import {
  Codex,
  type CodexOptions,
  type Thread,
  type ThreadItem,
  type ThreadOptions,
} from "@openai/codex-sdk";
import type { NormalizedEvent } from "../../src/lib/agent-protocol";
import { buildPrompt, type Engine, type EngineRunInput } from "./types";

/** Maps a Codex thread item to a normalized event (or null to ignore it). */
function itemToEvent(item: ThreadItem): NormalizedEvent | null {
  switch (item.type) {
    case "agent_message":
      return { type: "text", text: item.text };
    case "reasoning":
      return { type: "reasoning", text: item.text };
    case "command_execution":
      return { type: "tool", name: "command", detail: item.command };
    case "file_change":
      return { type: "tool", name: "file_change" };
    case "mcp_tool_call":
      return { type: "tool", name: `${item.server}.${item.tool}` };
    case "web_search":
      return { type: "tool", name: "web_search", detail: item.query };
    default:
      return null;
  }
}

/**
 * OpenAI Codex SDK adapter. `@openai/codex-sdk` drives the bundled `codex` CLI
 * (`@openai/codex`); we resume the native thread for same-engine continuation
 * or start a fresh one (rehydrated via {@link buildPrompt}) on an engine switch.
 */
export const codexEngine: Engine = {
  id: "codex",

  async *run(input: EngineRunInput): AsyncIterable<NormalizedEvent> {
    const { profile } = input;

    const codexOptions: CodexOptions = {};
    if (profile.apiKey) codexOptions.apiKey = profile.apiKey;
    if (profile.baseUrl) codexOptions.baseUrl = profile.baseUrl;
    const codex = new Codex(codexOptions);

    const threadOptions: ThreadOptions = {
      workingDirectory: input.cwd,
      sandboxMode: "read-only",
      skipGitRepoCheck: true,
      ...(profile.model ? { model: profile.model } : {}),
    };
    const thread: Thread = input.resume
      ? codex.resumeThread(input.resume.nativeThreadId, threadOptions)
      : codex.startThread(threadOptions);

    const { events } = await thread.runStreamed(buildPrompt(input), {
      signal: input.signal,
    });

    let finalText = "";

    for await (const event of events) {
      switch (event.type) {
        case "thread.started":
          yield { type: "thread", nativeThreadId: event.thread_id };
          break;
        case "item.completed": {
          if (event.item.type === "agent_message") finalText = event.item.text;
          const mapped = itemToEvent(event.item);
          if (mapped) yield mapped;
          break;
        }
        case "turn.completed":
          yield {
            type: "result",
            text: finalText,
            usage: {
              inputTokens: event.usage.input_tokens,
              outputTokens: event.usage.output_tokens,
              cachedInputTokens: event.usage.cached_input_tokens,
            },
          };
          break;
        case "turn.failed":
          yield { type: "error", message: event.error.message };
          break;
        case "error":
          yield { type: "error", message: event.message };
          break;
      }
    }
  },
};
