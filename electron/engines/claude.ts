import { query } from "@anthropic-ai/claude-agent-sdk";
import type { NormalizedEvent } from "../../src/lib/agent-protocol";
import { buildPrompt, type Engine, type EngineRunInput } from "./types";

/**
 * Claude Agent SDK adapter. Wraps `query()` — which spawns the native `claude`
 * CLI — and translates its `SDKMessage` stream into mineco's engine-neutral
 * {@link NormalizedEvent}s.
 */
export const claudeEngine: Engine = {
  id: "claude",

  async *run(input: EngineRunInput): AsyncIterable<NormalizedEvent> {
    const { profile } = input;

    // SDK's `env` replaces the subprocess environment wholesale (not merged),
    // so spread process.env to keep PATH etc. Only override credentials the
    // profile actually specifies.
    const env: Record<string, string> = { ...process.env } as Record<
      string,
      string
    >;
    if (profile.apiKey) env.ANTHROPIC_API_KEY = profile.apiKey;
    if (profile.baseUrl) env.ANTHROPIC_BASE_URL = profile.baseUrl;

    // The SDK cancels via an AbortController; forward the caller's signal.
    const abortController = new AbortController();
    if (input.signal.aborted) abortController.abort();
    else input.signal.addEventListener("abort", () => abortController.abort());

    let threadEmitted = false;

    for await (const message of query({
      prompt: buildPrompt(input),
      options: {
        cwd: input.cwd,
        ...(profile.model ? { model: profile.model } : {}),
        ...(input.resume ? { resume: input.resume.nativeThreadId } : {}),
        includePartialMessages: true,
        // Minimal read-only agent for v1 (write tools + permission UI later).
        permissionMode: "bypassPermissions",
        allowedTools: ["Read", "Glob", "Grep"],
        abortController,
        env,
      },
    })) {
      // Capture the engine's native session id once, for same-engine resume.
      if (!threadEmitted && "session_id" in message && message.session_id) {
        threadEmitted = true;
        yield { type: "thread", nativeThreadId: message.session_id };
      }

      switch (message.type) {
        case "stream_event": {
          const ev = message.event;
          if (ev.type === "content_block_delta") {
            if (ev.delta.type === "text_delta") {
              yield { type: "text", text: ev.delta.text };
            } else if (ev.delta.type === "thinking_delta") {
              yield { type: "reasoning", text: ev.delta.thinking };
            }
          }
          break;
        }
        case "assistant": {
          for (const block of message.message.content) {
            if (block.type === "tool_use") {
              yield { type: "tool", name: block.name };
            }
          }
          break;
        }
        case "result": {
          if (message.subtype === "success") {
            yield {
              type: "result",
              text: message.result,
              usage: {
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens,
                cachedInputTokens: message.usage.cache_read_input_tokens,
                costUsd: message.total_cost_usd,
              },
            };
          } else {
            yield { type: "error", message: `Run ended: ${message.subtype}` };
          }
          break;
        }
      }
    }
  },
};
