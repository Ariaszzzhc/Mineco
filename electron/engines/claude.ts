import {
  type CanUseTool,
  type Options,
  type PermissionMode,
  query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  EngineCapabilities,
  NormalizedEvent,
  NormalizedUsage,
  RunMode,
} from "../../src/lib/agent-protocol";
import { buildPrompt, type Engine, type EngineRunInput } from "./types";

/**
 * Claude Agent SDK adapter (EDD §3.1–3.3, §1.5).
 *
 * Two-axis model: each Agent is an isolated `CLAUDE_CONFIG_DIR`
 * (`agent.configDir`) holding the Claude-native `settings.json` (env with
 * token/baseURL + model aliases; permissions; hooks). The SDK self-manages
 * credentials and the native session JSONL inside it; mineco never touches the
 * user's `~/.claude`. A turn runs that config dir against the workspace `cwd`
 * with global instructions + memory appended to the preset system prompt.
 *
 * The adapter wraps `query()` — which spawns the native `claude` CLI — and
 * translates its `SDKMessage` stream into mineco's engine-neutral
 * {@link NormalizedEvent}s. It runs with streaming input
 * (`AsyncIterable<SDKUserMessage>`) so mid-turn control (answering
 * `AskUserQuestion`) is possible.
 */

/** Run modes this adapter exposes (carried elsewhere as opaque string ids). */
const MODES: RunMode[] = [
  {
    id: "default",
    label: "Default",
    description: "Standard behavior; edits gated by per-tool permission.",
  },
  {
    id: "plan",
    label: "Plan",
    description: "Read-only planning; no tools are executed.",
  },
  {
    id: "auto",
    label: "Auto",
    description: "Bypass all permission checks and run autonomously.",
  },
  {
    id: "acceptEdits",
    label: "Accept edits",
    description: "Auto-accept edits, but confirm each write first.",
    requiresApproval: true,
  },
];

/**
 * Maps a mineco {@link RunMode} id to a Claude `permissionMode`.
 *
 * - `default` → `'default'` (edits are gated by `canUseTool`).
 * - `plan` → `'plan'` (read-only planning).
 * - `auto` → `'bypassPermissions'` (no gate).
 * - `acceptEdits` → `'acceptEdits'` (the SDK auto-accepts edits; we still gate
 *   `Write` through `canUseTool` since the mode `requiresApproval`).
 */
function toPermissionMode(modeId: string): PermissionMode {
  switch (modeId) {
    case "plan":
      return "plan";
    case "auto":
      return "bypassPermissions";
    case "acceptEdits":
      return "acceptEdits";
    default:
      return "default";
  }
}

/** Tools that trigger an approval gate when the mode asks for one. */
const APPROVAL_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/** A blocking question awaiting the renderer's answer. */
interface PendingQuestion {
  resolve: (answer: { optionIds: string[]; freeText?: string }) => void;
}

/**
 * Resolves the concrete model id for the chosen alias from the agent's
 * `settings.json` env (`ANTHROPIC_DEFAULT_<ALIAS>_MODEL`). Returns `undefined`
 * when no concrete id is configured, so the alias env in the isolated config
 * dir drives model selection instead.
 */
function resolveModel(input: EngineRunInput): string | undefined {
  const alias = (input.modelAlias || input.agent.defaultModel || "")
    .trim()
    .toLowerCase();
  if (alias !== "sonnet" && alias !== "opus" && alias !== "haiku") {
    return undefined;
  }
  const key = `ANTHROPIC_DEFAULT_${alias.toUpperCase()}_MODEL`;
  const configured = process.env[key];
  return configured?.trim() ? configured : undefined;
}

/**
 * Builds the system-prompt `append` string from global instructions + memory.
 * We always use the `claude_code` preset (NEVER `replace`) so the CLI's own
 * tooling guidance is preserved; mineco only appends context.
 */
function buildAppend(input: EngineRunInput): string | undefined {
  const parts: string[] = [];
  if (input.globalInstructions?.trim()) parts.push(input.globalInstructions);
  if (input.memory?.trim()) parts.push(input.memory);
  return parts.length ? parts.join("\n\n") : undefined;
}

/** Extracts a one-line detail for a tool card (file path / command / pattern). */
function summarizeToolInput(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const candidate =
    o.file_path ?? o.path ?? o.command ?? o.pattern ?? o.query ?? o.url;
  return typeof candidate === "string" ? candidate : undefined;
}

/** Groups adjacent tool calls of the same kind for the renderer. */
function toolGroup(name: string): string {
  if (name === "Read" || name === "Glob" || name === "Grep") return "read";
  if (APPROVAL_TOOLS.has(name)) return "edit";
  if (name === "Bash") return "exec";
  return name;
}

/** Maps the SDK's tool-result content into a flat string. */
function flattenResult(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .map((b) =>
        b && typeof b === "object" && "text" in b
          ? String((b as { text: unknown }).text ?? "")
          : "",
      )
      .join("");
    return text || undefined;
  }
  return undefined;
}

/** Normalizes the SDK usage block into mineco's {@link NormalizedUsage}. */
function toUsage(
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  },
  totalCostUsd: number,
): NormalizedUsage {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cachedInputTokens: usage.cache_read_input_tokens ?? 0,
    costUsd: totalCostUsd,
  };
}

export const claudeEngine: Engine = {
  id: "claude",

  /** Static capability descriptor surfaced to the renderer. */
  capabilities(): EngineCapabilities {
    return {
      modes: MODES,
      supportsResume: true,
      supportsThinking: true,
      supportsMcp: true,
      supportsSkills: true,
    };
  },

  async *run(input: EngineRunInput): AsyncIterable<NormalizedEvent> {
    const { agent } = input;

    // The SDK's `env` REPLACES the subprocess environment wholesale (not
    // merged), so spread `process.env` to keep PATH / HOME / ambient creds.
    // `CLAUDE_CONFIG_DIR` points the CLI at this agent's isolated dir, where its
    // settings.json (token/baseURL/model aliases) and native session JSONL live.
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }
    env.CLAUDE_CONFIG_DIR = agent.configDir;

    // Forward the caller's abort signal to the SDK's controller.
    const abortController = new AbortController();
    if (input.signal.aborted) abortController.abort();
    else input.signal.addEventListener("abort", () => abortController.abort());

    // Mid-turn questions: AskUserQuestion arrives as a tool_use in the assistant
    // stream; we emit a `question`, await the renderer via `onQuestion`, then
    // feed the answer back through streaming input as the next user message so
    // the same native turn continues.
    const pending = new Map<string, PendingQuestion>();
    let closeInput!: () => void;
    const inputQueue: SDKUserMessage[] = [];
    let resolveNext: (() => void) | null = null;
    let closed = false;

    function pushInput(msg: SDKUserMessage): void {
      inputQueue.push(msg);
      resolveNext?.();
      resolveNext = null;
    }

    async function* promptStream(): AsyncIterable<SDKUserMessage> {
      // First message: the (possibly transcript-rehydrated) user prompt.
      yield {
        type: "user",
        parent_tool_use_id: null,
        message: { role: "user", content: buildPrompt(input) },
      } as SDKUserMessage;

      while (!closed) {
        if (inputQueue.length) {
          const next = inputQueue.shift();
          if (next) yield next;
          continue;
        }
        await new Promise<void>((r) => {
          resolveNext = r;
          closeInput = () => {
            closed = true;
            r();
          };
        });
      }
    }

    const modeId = input.mode?.id ?? "default";
    const permissionMode = toPermissionMode(modeId);
    const gateEdits = modeId === "default" || input.mode?.requiresApproval;

    /** Approval + question gate. Defaults to allow so turns never hang. */
    const canUseTool: CanUseTool = async (name, toolInput) => {
      if (name === "AskUserQuestion") {
        const answer = await askQuestion(toolInput);
        // Pass the user's selection through as the tool's input; the SDK's
        // built-in AskUserQuestion executes and records the answer.
        return {
          behavior: "allow",
          updatedInput: {
            ...toolInput,
            _minecoAnswer: answer,
          },
        };
      }

      if (gateEdits && APPROVAL_TOOLS.has(name)) {
        const decision = input.onApproval
          ? await input.onApproval({
              approvalId: cryptoId(),
              title: `Allow ${name} on ${summarizeToolInput(toolInput) ?? "file"}?`,
              diff: toolInput,
            })
          : { approve: true };
        if (!decision.approve) {
          return {
            behavior: "deny",
            message: decision.message ?? "Denied by user.",
          };
        }
      }

      return { behavior: "allow", updatedInput: toolInput };
    };

    /** Emits a `question` event and blocks on the renderer's answer. */
    async function askQuestion(
      toolInput: Record<string, unknown>,
    ): Promise<{ optionIds: string[]; freeText?: string }> {
      const q = parseQuestion(toolInput);
      if (!input.onQuestion) return { optionIds: [], freeText: undefined };
      return input.onQuestion(q);
    }

    const options: Options = {
      cwd: input.cwd,
      // Load only this agent's isolated config dir; never the user's ~/.claude.
      settingSources: ["user"],
      // Preserve the CLI's tooling guidance; append mineco context only.
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        ...(buildAppend(input) ? { append: buildAppend(input) } : {}),
      },
      ...(resolveModel(input) ? { model: resolveModel(input) } : {}),
      ...(input.resume ? { resume: input.resume.nativeThreadId } : {}),
      includePartialMessages: true,
      permissionMode,
      ...(permissionMode === "bypassPermissions"
        ? { allowDangerouslySkipPermissions: true }
        : {}),
      canUseTool,
      abortController,
      env,
    };

    let threadEmitted = false;

    try {
      for await (const message of query({
        prompt: promptStream(),
        options,
      })) {
        // Capture the native session id once, for same-config-dir resume.
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
              if (block.type !== "tool_use") continue;
              const inputObj = block.input as Record<string, unknown>;

              if (block.name === "TodoWrite" || block.name === "ExitPlanMode") {
                const plan = parsePlan(block.name, inputObj);
                if (plan) yield plan;
                continue;
              }

              if (block.name === "AskUserQuestion") {
                const q = parseQuestion(inputObj);
                yield {
                  type: "question",
                  questionId: block.id,
                  kind: q.kind,
                  prompt: q.prompt,
                  options: q.options,
                  allowFreeText: q.allowFreeText,
                };
                continue;
              }

              yield {
                type: "tool",
                id: block.id,
                name: block.name,
                phase: "start",
                group: toolGroup(block.name),
                detail: summarizeToolInput(inputObj),
              };
            }
            break;
          }

          case "user": {
            // tool_result blocks arrive on the synthetic user message.
            const content = (message.message as { content?: unknown }).content;
            if (!Array.isArray(content)) break;
            for (const block of content) {
              if (
                !block ||
                typeof block !== "object" ||
                (block as { type?: string }).type !== "tool_result"
              ) {
                continue;
              }
              const tr = block as {
                tool_use_id: string;
                is_error?: boolean;
                content?: unknown;
              };
              yield {
                type: "tool",
                id: tr.tool_use_id,
                name: "",
                phase: "end",
                status: tr.is_error ? "error" : "ok",
                result: flattenResult(tr.content),
                output: flattenResult(tr.content),
              };
            }
            break;
          }

          case "result": {
            if (message.subtype === "success") {
              yield {
                type: "result",
                text: message.result,
                usage: toUsage(message.usage, message.total_cost_usd),
              };
            } else {
              yield {
                type: "error",
                message: `Run ended: ${message.subtype}`,
              };
            }
            break;
          }
        }
      }
    } finally {
      // Release any blocked question waiters and close the input stream so the
      // promptStream generator terminates.
      for (const p of pending.values()) p.resolve({ optionIds: [] });
      pending.clear();
      closed = true;
      closeInput?.();
    }

    // Reference to keep `pushInput` available for future mid-turn injection
    // (questions are answered through `canUseTool`'s `updatedInput` in v1).
    void pushInput;
  },
};

/** Generates a short opaque id for approval/question correlation. */
function cryptoId(): string {
  return Math.random().toString(36).slice(2, 11);
}

/**
 * Normalizes an `AskUserQuestion` tool input into the engine-neutral question
 * shape. The SDK passes `{ questions: [{ question, header, options, multiSelect
 * }] }`; we surface the first question.
 */
function parseQuestion(raw: Record<string, unknown>): {
  questionId: string;
  kind: "single" | "multi";
  prompt: string;
  options: { id: string; label: string; recommended?: boolean }[];
  allowFreeText: boolean;
} {
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  const first = (questions[0] ?? {}) as Record<string, unknown>;
  const prompt =
    (typeof first.question === "string" && first.question) ||
    (typeof raw.question === "string" && raw.question) ||
    "";
  const rawOptions = Array.isArray(first.options)
    ? first.options
    : Array.isArray(raw.options)
      ? raw.options
      : [];
  const options = rawOptions.map((o, i) => {
    if (typeof o === "string") return { id: String(i), label: o };
    const obj = (o ?? {}) as Record<string, unknown>;
    return {
      id: typeof obj.id === "string" ? obj.id : String(i),
      label:
        typeof obj.label === "string"
          ? obj.label
          : typeof obj.text === "string"
            ? obj.text
            : String(i),
      ...(obj.recommended ? { recommended: true } : {}),
    };
  });
  return {
    questionId: cryptoId(),
    kind: first.multiSelect ? "multi" : "single",
    prompt,
    options,
    allowFreeText: Boolean(first.allowFreeText ?? raw.allowFreeText ?? false),
  };
}

/**
 * Projects a `TodoWrite` / `ExitPlanMode` tool input into a `plan` event.
 * Returns `null` when the input carries no recognizable steps.
 */
function parsePlan(
  name: string,
  raw: Record<string, unknown>,
): Extract<NormalizedEvent, { type: "plan" }> | null {
  if (name === "TodoWrite") {
    const todos = Array.isArray(raw.todos) ? raw.todos : [];
    const steps = todos.map((t, i) => {
      const obj = (t ?? {}) as Record<string, unknown>;
      const status = obj.status;
      return {
        id: typeof obj.id === "string" ? obj.id : String(i),
        text:
          typeof obj.content === "string"
            ? obj.content
            : typeof obj.text === "string"
              ? obj.text
              : "",
        status:
          status === "completed"
            ? ("done" as const)
            : status === "in_progress"
              ? ("active" as const)
              : ("pending" as const),
      };
    });
    return steps.length ? { type: "plan", steps } : null;
  }

  // ExitPlanMode: a single free-text plan body.
  const plan = typeof raw.plan === "string" ? raw.plan : "";
  if (!plan) return null;
  return {
    type: "plan",
    steps: [{ id: "0", text: plan, status: "pending" }],
  };
}
