import {
  type CanUseTool,
  type McpServerConfig,
  type PermissionMode,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  McpServer,
  NormalizedEvent,
  RunMode,
} from "../../src/lib/agent-protocol";
import {
  buildPrompt,
  type Engine,
  type EngineRunInput,
  resolveSystemPrompt,
} from "./types";

/**
 * Maps mineco's {@link RunMode} to a Claude `permissionMode`. `default` and
 * `auto` use `bypassPermissions` so a turn never hangs waiting on a permission
 * UI we don't have yet; `plan` and `acceptEdits` map straight through.
 */
function toPermissionMode(mode: RunMode): PermissionMode {
  switch (mode) {
    case "plan":
      return "plan";
    case "acceptEdits":
      return "acceptEdits";
    default:
      return "bypassPermissions";
  }
}

/** Builds Claude `mcpServers` from enabled MCP rows. Best-effort: a malformed
 * config is skipped rather than crashing the turn. */
function buildMcpServers(
  servers: McpServer[],
): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {};
  for (const s of servers) {
    if (!s.enabled) continue;
    try {
      const parsed = s.env ? JSON.parse(s.env) : {};
      const envOrHeaders =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, string>)
          : {};
      if (s.transport === "http") {
        if (!s.command) continue;
        out[s.name] = { type: "http", url: s.command, headers: envOrHeaders };
      } else {
        if (!s.command) continue;
        const [command, ...args] = s.command.split(/\s+/).filter(Boolean);
        if (!command) continue;
        out[s.name] = { type: "stdio", command, args, env: envOrHeaders };
      }
    } catch {
      // Skip servers with bad env/header JSON.
    }
  }
  return out;
}

/** Auto-allow every tool so turns never block on a permission prompt (there is
 * no permission UI in v1). */
const allowAll: CanUseTool = async (_name, input) => ({
  behavior: "allow",
  updatedInput: input,
});

/**
 * Claude Agent SDK adapter. Wraps `query()` — which spawns the native `claude`
 * CLI — and translates its `SDKMessage` stream into mineco's engine-neutral
 * {@link NormalizedEvent}s.
 */
export const claudeEngine: Engine = {
  id: "claude",

  async *run(input: EngineRunInput): AsyncIterable<NormalizedEvent> {
    const { agent, model } = input;

    // SDK's `env` replaces the subprocess environment wholesale (not merged),
    // so spread process.env to keep PATH etc. Only override credentials the
    // agent actually specifies.
    const env: Record<string, string> = { ...process.env } as Record<
      string,
      string
    >;
    if (agent.apiKey) env.ANTHROPIC_API_KEY = agent.apiKey;
    if (agent.baseUrl) env.ANTHROPIC_BASE_URL = agent.baseUrl;

    // The SDK cancels via an AbortController; forward the caller's signal.
    const abortController = new AbortController();
    if (input.signal.aborted) abortController.abort();
    else input.signal.addEventListener("abort", () => abortController.abort());

    const systemPrompt = resolveSystemPrompt(agent);
    const mcpServers = buildMcpServers(input.mcpServers);

    let threadEmitted = false;

    for await (const message of query({
      prompt: buildPrompt(input),
      options: {
        cwd: input.cwd,
        ...(model ? { model } : {}),
        ...(input.resume ? { resume: input.resume.nativeThreadId } : {}),
        ...(systemPrompt ? { systemPrompt } : {}),
        ...(Object.keys(mcpServers).length ? { mcpServers } : {}),
        includePartialMessages: true,
        permissionMode: toPermissionMode(input.mode),
        allowedTools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
        canUseTool: allowAll,
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
              yield {
                type: "tool",
                name: block.name,
                detail: summarizeToolInput(block.input),
              };
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

/** Best-effort one-line detail for a tool card (file path / command / pattern). */
function summarizeToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const candidate =
    o.file_path ?? o.path ?? o.command ?? o.pattern ?? o.query ?? o.url;
  return typeof candidate === "string" ? candidate : undefined;
}
