import {
  type CanUseTool,
  type Options,
  type PermissionMode,
  type Query,
  query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  EngineCapabilities,
  NormalizedEvent,
  NormalizedUsage,
  RunMode,
} from "@/shared/agent-protocol";
import { AsyncQueue } from "./async-queue";
import {
  buildFirstPrompt,
  type Engine,
  type EngineSession,
  type EngineSessionInit,
  type TurnInput,
} from "./types";

/**
 * Claude Agent SDK adapter (EDD §3.1–3.3, §1.5).
 *
 * Two-axis model: each Agent is an isolated `CLAUDE_CONFIG_DIR`
 * (`agent.configDir`) holding the Claude-native `settings.json` (env with
 * token/baseURL + model aliases; permissions; hooks). The SDK self-manages
 * credentials and the native session JSONL inside it; mineco never touches the
 * user's `~/.claude`.
 *
 * **Session model.** A mineco session maps to ONE long-lived `query()` driven
 * with a streaming-input prompt (`AsyncIterable<SDKUserMessage>`). The query —
 * and its native subprocess — stays warm across turns: each turn pushes a user
 * message into the persistent input stream and consumes events until that
 * turn's terminal `result`. A single consumer loop drains the query for the
 * session's lifetime and demuxes events into the active turn's output channel;
 * the input stream is closed only on {@link ClaudeSession.close}. Per-turn model
 * and permission mode are applied via the SDK's `setModel` / `setPermissionMode`
 * control requests (streaming-input only).
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

/** Maps a mineco {@link RunMode} id to a Claude `permissionMode`. */
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

/**
 * Resolves the model role to pass to the CLI. We hand it the role alias
 * (sonnet/opus/fable/haiku) and let it resolve the concrete id — and any `[1m]`
 * suffix — from the config dir's `settings.json` env. Returns `undefined` for an
 * unknown alias, so the CLI's own default drives instead.
 */
function resolveModelAlias(alias: string | undefined): string | undefined {
  const a = (alias || "").trim().toLowerCase();
  if (a === "sonnet" || a === "opus" || a === "fable" || a === "haiku")
    return a;
  return undefined;
}

/**
 * Builds the system-prompt `append` from global instructions + memory. We always
 * use the `claude_code` preset (NEVER `replace`) so the CLI's own tooling
 * guidance is preserved; mineco only appends context.
 */
function buildAppend(init: EngineSessionInit): string | undefined {
  const parts: string[] = [];
  if (init.globalInstructions?.trim()) parts.push(init.globalInstructions);
  if (init.memory?.trim()) parts.push(init.memory);
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
  context: { tokens: number; window: number },
): NormalizedUsage {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cachedInputTokens: usage.cache_read_input_tokens ?? 0,
    costUsd: totalCostUsd,
    ...(context.tokens ? { contextTokens: context.tokens } : {}),
    ...(context.window ? { contextWindow: context.window } : {}),
  };
}

/**
 * Picks the context window for the live fill ratio. Prefers the model that
 * produced the turn's final request; falls back to the largest window among
 * all models used.
 */
function pickContextWindow(
  modelUsage: Record<string, { contextWindow?: number }> | undefined,
  model: string,
): number {
  if (!modelUsage) return 0;
  const exact = model ? modelUsage[model]?.contextWindow : undefined;
  if (exact) return exact;
  let max = 0;
  for (const mu of Object.values(modelUsage)) {
    if (mu?.contextWindow && mu.contextWindow > max) max = mu.contextWindow;
  }
  return max;
}

/** Per-turn streaming state: the output channel + the active bridges + the
 * input-side context fill accumulated from this turn's requests. */
interface ActiveTurn {
  out: AsyncQueue<NormalizedEvent>;
  onApproval?: TurnInput["onApproval"];
  onQuestion?: TurnInput["onQuestion"];
  /** Gate APPROVAL_TOOLS through `onApproval` this turn? */
  gateEdits: boolean;
  /** Whether the `thread` event has been forwarded to this turn yet. */
  threadEmitted: boolean;
  /** Input tokens + model of this turn's most recent request (the live fill). */
  lastContextTokens: number;
  lastModel: string;
}

/**
 * A persistent Claude session: one `query()` kept warm across turns. Construct
 * once per (mineco session, agent); call {@link runTurn} per user message.
 */
class ClaudeSession implements EngineSession {
  readonly agentId: string;

  /** Persistent streaming-input channel; closed only on {@link close}. */
  private readonly input = new AsyncQueue<SDKUserMessage>();
  /** Hard-stop controller for {@link close} (kills the subprocess). */
  private readonly abortController = new AbortController();
  private readonly query: Query;

  /** The native session id (constant for the query's life), captured once. */
  private nativeSessionId: string | null = null;
  /** True once the first user message's prompt has been built/seeded. */
  private firstTurn = true;
  /** The turn currently streaming, or null between turns. */
  private active: ActiveTurn | null = null;
  private readonly init: EngineSessionInit;

  constructor(init: EngineSessionInit) {
    this.init = init;
    this.agentId = init.agent.id;

    // The SDK's `env` REPLACES the subprocess environment wholesale (not
    // merged), so spread `process.env` to keep PATH / HOME / ambient creds.
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }
    env.CLAUDE_CONFIG_DIR = init.agent.configDir;

    const append = buildAppend(init);
    const options: Options = {
      cwd: init.cwd,
      // Load only this agent's isolated config dir; never the user's ~/.claude.
      settingSources: ["user"],
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        ...(append ? { append } : {}),
      },
      // Seed the default model; each turn overrides via `setModel`.
      ...(resolveModelAlias(init.agent.defaultModel)
        ? { model: resolveModelAlias(init.agent.defaultModel) }
        : {}),
      ...(init.resume ? { resume: init.resume.nativeThreadId } : {}),
      // Use the on-demand-provisioned native binary (see services/cli-binary);
      // bypasses the SDK's own optional-package resolver. A native binary is
      // spawned directly — no `node` is involved.
      ...(init.cliExecutablePath
        ? { pathToClaudeCodeExecutable: init.cliExecutablePath }
        : {}),
      includePartialMessages: true,
      // Per-turn modes are applied via `setPermissionMode`; the real edit gate
      // is `canUseTool` below, so we start permissive-by-callback in "default".
      permissionMode: "default",
      canUseTool: this.canUseTool,
      abortController: this.abortController,
      env,
    };

    this.query = query({ prompt: this.input, options });
    void this.consume();
  }

  /** Approval + question gate. Reads the active turn's bridges; defaults to
   * allow so turns never hang. */
  private canUseTool: CanUseTool = async (name, toolInput) => {
    const a = this.active;
    if (name === "AskUserQuestion") {
      const q = parseQuestion(toolInput);
      const answer = a?.onQuestion
        ? await a.onQuestion(q)
        : { optionIds: [], freeText: undefined };
      return {
        behavior: "allow",
        updatedInput: { ...toolInput, _minecoAnswer: answer },
      };
    }

    if (a?.gateEdits && APPROVAL_TOOLS.has(name)) {
      const decision = a.onApproval
        ? await a.onApproval({
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

  async *runTurn(input: TurnInput): AsyncIterable<NormalizedEvent> {
    const out = new AsyncQueue<NormalizedEvent>();
    const active: ActiveTurn = {
      out,
      onApproval: input.onApproval,
      onQuestion: input.onQuestion,
      gateEdits:
        input.mode.id === "default" || Boolean(input.mode.requiresApproval),
      threadEmitted: false,
      lastContextTokens: 0,
      lastModel: "",
    };
    this.active = active;

    // Apply per-turn model + permission mode on the live query. Best-effort:
    // `canUseTool` is the real gate, and an unknown alias falls back to default.
    try {
      await this.query.setModel(resolveModelAlias(input.modelAlias));
    } catch {
      /* control request unavailable; default model stands */
    }
    try {
      await this.query.setPermissionMode(toPermissionMode(input.mode.id));
    } catch {
      /* control request unavailable; canUseTool still gates */
    }

    // Push the user message. The first turn carries seed/transcript shaping.
    const text = this.firstTurn
      ? buildFirstPrompt(input.prompt, this.init.seedHistory)
      : input.prompt;
    this.firstTurn = false;
    this.input.push({
      type: "user",
      parent_tool_use_id: null,
      message: { role: "user", content: text },
    } as SDKUserMessage);

    try {
      for await (const event of out) yield event;
    } finally {
      if (this.active === active) this.active = null;
    }
  }

  async interrupt(): Promise<void> {
    try {
      await this.query.interrupt();
    } catch {
      /* nothing in flight / not supported */
    }
  }

  async close(): Promise<void> {
    // End the input stream so the query finalizes, and hard-abort to stop any
    // in-flight work and free the subprocess promptly.
    this.input.end();
    this.abortController.abort();
    this.active?.out.end();
    this.active = null;
  }

  /** Long-lived consumer: drains the query for the session's life and demuxes
   * messages into the active turn's output channel. A `result` ends the TURN
   * (closes the channel); it does NOT end the query — the input stream stays
   * open so the next turn reuses the same warm session. */
  private async consume(): Promise<void> {
    try {
      for await (const message of this.query) {
        if (
          !this.nativeSessionId &&
          "session_id" in message &&
          message.session_id
        ) {
          this.nativeSessionId = message.session_id;
        }

        const a = this.active;
        if (!a) continue; // between turns; the model is idle here in practice

        // Forward the native thread id once per turn so the runner can persist
        // it (enables cold-reopen resume after a restart).
        if (!a.threadEmitted && this.nativeSessionId) {
          a.threadEmitted = true;
          a.out.push({ type: "thread", nativeThreadId: this.nativeSessionId });
        }

        switch (message.type) {
          case "stream_event": {
            const ev = message.event;
            if (ev.type === "content_block_delta") {
              if (ev.delta.type === "text_delta") {
                a.out.push({ type: "text", text: ev.delta.text });
              } else if (ev.delta.type === "thinking_delta") {
                a.out.push({ type: "reasoning", text: ev.delta.thinking });
              }
            }
            break;
          }

          case "assistant": {
            const am = message.message as {
              model?: string;
              usage?: {
                input_tokens?: number;
                cache_read_input_tokens?: number;
                cache_creation_input_tokens?: number;
              };
            };
            if (am.usage) {
              a.lastContextTokens =
                (am.usage.input_tokens ?? 0) +
                (am.usage.cache_read_input_tokens ?? 0) +
                (am.usage.cache_creation_input_tokens ?? 0);
            }
            if (typeof am.model === "string" && am.model)
              a.lastModel = am.model;

            for (const block of message.message.content) {
              if (block.type !== "tool_use") continue;
              const inputObj = block.input as Record<string, unknown>;

              if (block.name === "TodoWrite" || block.name === "ExitPlanMode") {
                const plan = parsePlan(block.name, inputObj);
                if (plan) a.out.push(plan);
                continue;
              }

              if (block.name === "AskUserQuestion") {
                const q = parseQuestion(inputObj);
                a.out.push({
                  type: "question",
                  questionId: block.id,
                  kind: q.kind,
                  prompt: q.prompt,
                  options: q.options,
                  allowFreeText: q.allowFreeText,
                });
                continue;
              }

              a.out.push({
                type: "tool",
                id: block.id,
                name: block.name,
                phase: "start",
                group: toolGroup(block.name),
                detail: summarizeToolInput(inputObj),
              });
            }
            break;
          }

          case "user": {
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
              a.out.push({
                type: "tool",
                id: tr.tool_use_id,
                name: "",
                phase: "end",
                status: tr.is_error ? "error" : "ok",
                result: flattenResult(tr.content),
                output: flattenResult(tr.content),
              });
            }
            break;
          }

          case "result": {
            if (message.subtype === "success") {
              a.out.push({
                type: "result",
                text: message.result,
                usage: toUsage(message.usage, message.total_cost_usd, {
                  tokens: a.lastContextTokens,
                  window: pickContextWindow(message.modelUsage, a.lastModel),
                }),
              });
            } else {
              a.out.push({
                type: "error",
                message: `Run ended: ${message.subtype}`,
              });
            }
            // Terminal for THIS turn only: close the turn's channel so its
            // iterator returns. The query stays alive for the next turn.
            a.out.end();
            break;
          }
        }
      }
    } catch (err) {
      this.active?.out.fail(err);
    } finally {
      // Query ended (session closed / aborted): release any waiting turn.
      this.active?.out.end();
    }
  }
}

export const claudeEngine: Engine = {
  id: "claude",

  capabilities(): EngineCapabilities {
    return {
      modes: MODES,
      supportsResume: true,
      supportsThinking: true,
      supportsMcp: true,
      supportsSkills: true,
    };
  },

  openSession(init: EngineSessionInit): EngineSession {
    return new ClaudeSession(init);
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
