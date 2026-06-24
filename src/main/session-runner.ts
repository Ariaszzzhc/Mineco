/**
 * Session runner — orchestrates one turn end-to-end (EDD §6.1).
 *
 * Responsibilities for `runTurn(req, emit)`:
 *   1. Load the session + the selected Agent (filesystem-backed); resolve the
 *      chosen model alias to a concrete id for the turn record.
 *   2. Look up the engine {@link RunMode} by `req.mode` id (falling back to
 *      `default`).
 *   3. Get the session's persistent {@link EngineSession} (one warm native
 *      query). Reuse it when it is already bound to `req.agentId`; otherwise
 *      OPEN a fresh one — deciding resume-vs-seed by AGENT IDENTITY:
 *        - same agent + a prior native thread id ⟹ cold-reopen `resume`;
 *        - otherwise (first turn / agent switch) ⟹ seed the fresh thread with
 *          the prior canonical transcript (`seedHistory`, captured BEFORE this
 *          turn's user message is recorded). Opening assembles the per-session
 *          injection context (global instructions + memory + MCP).
 *   4. Persist the turn + the user message, auto-title the session from its
 *      first prompt, rebind the session to the agent, and mark it running.
 *   5. Stream the turn's normalized events to `emit`, bridging mid-turn
 *      `question` / `approval` requests back to the renderer via a pending map
 *      that {@link resolveTurnResponse} resolves.
 *   6. On completion, persist the assistant message (concatenated reasoning + a
 *      tools JSON array), finish the turn, remember the workspace's last mode +
 *      agent selection, and mark the session idle. The native query stays warm
 *      for the next turn.
 *
 * Run state lives ONLY in the in-memory run registry (never the DB). The live
 * native query lives ONLY in the engine-session registry.
 */

import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import type {
  NormalizedEvent,
  NormalizedUsage,
  RunMode,
  ToolRecord,
  TurnResponse,
  TurnRunRequest,
} from "@/shared/agent-protocol";
import { claudeEngine } from "./engines/claude";
import { getAgentDetail, resolveModel } from "./services/agent";
import { ensureClaudeCli } from "./services/cli-binary";
import { assembleContext } from "./services/context-assembly";
import {
  getLiveSession,
  getMatchingSession,
  holdSession,
  isCwdLive,
  openSession,
  releaseSession,
} from "./services/engine-sessions";
import { ensureLink } from "./services/link";
import {
  markIdle,
  markRunning,
  type RunStateListener,
  setListener,
} from "./services/run-registry";
import { rememberSelection } from "./services/workspace";
import { addMessage, listMessages } from "./store/messages";
import { sessionsDir } from "./store/paths";
import {
  finishTurn,
  getLastTurn,
  getSession,
  getSessionRealCwd,
  rebindSessionAgent,
  setSessionTitle,
} from "./store/sessions";

/**
 * Per-request orchestration state for an in-flight turn. Holds the owning
 * session id (so abort can reach the live query to {@link EngineSession.interrupt})
 * and the bridge that resolves mid-turn question/approval requests when the
 * renderer answers via {@link resolveTurnResponse}.
 */
interface InFlight {
  sessionId: string;
  /** Pending question/approval requests keyed by their question/approval id. */
  pending: Map<
    string,
    {
      kind: "question" | "approval";
      // biome-ignore lint/suspicious/noExplicitAny: resolver shape varies by kind.
      resolve: (value: any) => void;
    }
  >;
}

/** In-flight turns, keyed by request id, so abort + respond can reach them. */
const inFlight = new Map<string, InFlight>();

/** Interrupts a running turn's live query (no-op if it already finished). The
 * session/query stays warm — interrupt stops the turn, it does not tear down. */
export function abortTurn(requestId: string): void {
  const flight = inFlight.get(requestId);
  if (!flight) return;
  void getLiveSession(flight.sessionId)?.interrupt();
}

/**
 * Resolves a mid-turn question / approval the renderer answered. No-op if the
 * turn or request id is unknown (e.g. it already finished or was aborted).
 */
export function resolveTurnResponse(resp: TurnResponse): void {
  const flight = inFlight.get(resp.requestId);
  if (!flight) return;
  const pending = flight.pending.get(resp.id);
  if (!pending) return;
  flight.pending.delete(resp.id);

  if (pending.kind === "approval") {
    pending.resolve({ approve: resp.approve ?? true, message: resp.message });
  } else {
    pending.resolve({
      optionIds: resp.optionIds ?? [],
      freeText: resp.freeText,
    });
  }
}

/**
 * Subscribes to run-registry changes so `main.ts` can broadcast
 * `runStateChanged`. Returns an unsubscribe function.
 */
export function onRunStateChanged(listener: RunStateListener): () => void {
  return setListener(listener);
}

/** Derives a short session title from the first user prompt (~48 chars). */
function deriveTitle(prompt: string): string {
  const flat = prompt.trim().replace(/\s+/g, " ");
  return flat.length > 48 ? `${flat.slice(0, 47)}…` : flat || "Untitled";
}

/** Resolves the engine {@link RunMode} for a mode id, falling back to default. */
function resolveMode(modeId: string): RunMode {
  const modes = claudeEngine.capabilities().modes;
  return modes.find((m) => m.id === modeId) ?? modes[0];
}

/** True if the file at `p` exists and is a regular file (R7 JSONL guard). */
async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Whether the session's previously-bound agent runs on the SAME engine as the
 * agent this turn runs under (ADR-0.4-5). Native resume only crosses agents
 * within ONE engine: the link makes same-workspace same-engine agents share the
 * native thread JSONL, but a thread is not portable across engines. A session
 * with no prior agent (first turn) trivially matches the incoming engine.
 */
async function isSameEngineAsSession(
  priorAgentId: string | null,
  engine: string,
): Promise<boolean> {
  if (!priorAgentId) return true;
  const prior = await getAgentDetail(priorAgentId);
  // A missing prior agent (deleted) can't be proven same-engine → seed.
  return prior?.engine === engine;
}

/**
 * Rejects every still-pending question/approval for a request — used on abort
 * or error so the engine's `await onApproval/onQuestion` calls unblock and the
 * run can wind down instead of hanging.
 */
function rejectPending(flight: InFlight): void {
  for (const [, p] of flight.pending) {
    if (p.kind === "approval")
      p.resolve({ approve: false, message: "Aborted." });
    else p.resolve({ optionIds: [], freeText: undefined });
  }
  flight.pending.clear();
}

/**
 * Runs one turn end-to-end. Streams {@link NormalizedEvent}s to `emit`; the
 * caller (main.ts) forwards them on the request's private IPC channel.
 */
export async function runTurn(
  req: TurnRunRequest,
  emit: (event: NormalizedEvent) => void,
): Promise<void> {
  const [session, agent] = await Promise.all([
    getSession(req.sessionId),
    getAgentDetail(req.agentId),
  ]);
  if (!session || !agent) {
    emit({ type: "error", message: "Unknown session or agent." });
    return;
  }

  // Resolve the chosen alias to a concrete model id for the turn record (the
  // engine resolves the alias itself per turn via the config dir's env).
  const model = await resolveModel(
    req.agentId,
    req.model || agent.defaultModel,
  );
  const mode = resolveMode(req.mode);
  const lastTurn = await getLastTurn(req.sessionId);

  // Reuse the warm session if it is already bound to this agent; otherwise open
  // a fresh native query, deciding resume-vs-seed by ENGINE identity (ADR-0.4-5).
  let engineSession = getMatchingSession(req.sessionId, req.agentId);
  if (!engineSession) {
    // The cwd the SDK encodes for `projects/<encoded-cwd>` is `realpath(cwd)`
    // (R3). Use the value stored at session-create for both the link AND the
    // query cwd so the encodings line up; fall back to the raw cwd.
    const realCwd = (await getSessionRealCwd(req.sessionId)) ?? session.cwd;

    // The native CLI binary is provisioned on demand (downloaded + verified on
    // first use); fail the turn cleanly if it can't be obtained.
    let cliExecutablePath: string;
    try {
      cliExecutablePath = await ensureClaudeCli((p) =>
        emit({ type: "status", phase: "engine-binary", detail: p.phase }),
      );
    } catch (err) {
      emit({
        type: "error",
        message: `Could not provision the Claude engine binary: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      return;
    }

    // ADR-0.4-3/8: link this agent's `projects/<encoded-cwd>` at the shared
    // per-workspace target ONCE, in the same cold-open lifecycle slot as the
    // CLI provisioning (NEVER per turn). The migration step gates against the
    // live engine-session map (ADR-0.4-7) — excluding THIS session, whose own
    // prior warm query (if any) is already closed by `openSession`.
    const link = await ensureLink(
      agent.configDir,
      realCwd,
      session.workspaceId,
      { isLive: (cwd) => isCwdLive(cwd, req.sessionId) },
    );
    // `degraded` (neither symlink nor junction works) → keep the per-agent
    // isolated dir: no resume sharing, memory falls back to inject-only for
    // this session (no behavior change yet — native-dir memory is Phase 5).
    const shared = link.kind !== "degraded";
    if (!shared) {
      console.warn(
        `[link] degraded to per-agent isolation for session ${req.sessionId} ` +
          `(${link.reason}); resume sharing + native-dir memory unavailable.`,
      );
    }

    // Resume pivots on ENGINE identity (ADR-0.4-5): same-workspace Claude→Claude
    // resumes natively because the link points the new agent's
    // `projects/<cwd>` at the shared target that holds the prior thread's JSONL.
    // Cross-engine (future) → seedHistory (the reseed path below stays as
    // cross-engine-only dead code). Guard: the JSONL must actually exist at the
    // linked target (stale handle / just-linked / migrated-away → seedHistory).
    const sameEngine = await isSameEngineAsSession(
      session.agentId,
      agent.engine,
    );
    let resume: { nativeThreadId: string } | undefined;
    if (shared && sameEngine && lastTurn?.nativeThreadId) {
      const jsonl = path.join(
        sessionsDir(session.workspaceId),
        `${lastTurn.nativeThreadId}.jsonl`,
      );
      if (await fileExists(jsonl)) {
        resume = { nativeThreadId: lastTurn.nativeThreadId };
      }
    }

    // Memory assembly branches on capability (ADR-0.4-6): a `native-dir` engine
    // (Claude) reads/writes its own auto-memory dir through the ADR-0.4-3 link,
    // so mineco stops injecting. But a session DEGRADED to per-agent isolation
    // (ADR-0.4-8, `shared === false`) has no link, so the native dir is private
    // and unshared — fall back to inject-only so manual memory still reaches it.
    const engineMemory = claudeEngine.capabilities().memory;
    const memoryMode =
      engineMemory === "native-dir" && !shared ? "inject-only" : engineMemory;

    // Seed history is captured BEFORE this turn's user message is recorded, and
    // only needed when starting a fresh native thread (no native resume).
    const [seedHistory, ctx] = await Promise.all([
      resume ? Promise.resolve(undefined) : listMessages(req.sessionId),
      assembleContext({ workspaceId: session.workspaceId, memoryMode }),
    ]);
    engineSession = await openSession(req.sessionId, agent.engine, {
      cwd: realCwd,
      agent,
      cliExecutablePath,
      globalInstructions: ctx.globalInstructions,
      memory: ctx.memory,
      mcpServers: ctx.mcpServers,
      resume,
      seedHistory,
    });
  }

  // The turn ledger is gone (ADR-0.4-2); a turn id is now just a correlation
  // id stamped onto this turn's messages. The last-turn projection that the
  // resume decision reads back is persisted by `finishTurn` into the sidecar.
  const turnId = randomUUID();
  await addMessage({
    sessionId: req.sessionId,
    turnId,
    role: "user",
    content: req.prompt,
    engine: null,
  });

  // Rebind the session to the agent it now runs under (no-op when unchanged).
  if (session.agentId !== req.agentId) {
    await rebindSessionAgent(req.sessionId, req.agentId);
  }

  // Auto-title an as-yet-untitled session from its first user prompt.
  if (session.title === "Untitled") {
    await setSessionTitle(req.sessionId, deriveTitle(req.prompt));
  }

  const flight: InFlight = { sessionId: req.sessionId, pending: new Map() };
  inFlight.set(req.id, flight);
  markRunning(req.sessionId, req.id);
  // Exempt the warm session from idle eviction for the turn's duration.
  holdSession(req.sessionId);

  // Seed with the prior native thread id so a resumed turn persists it even if
  // the engine doesn't re-emit `thread`.
  let nativeThreadId: string | null = lastTurn?.nativeThreadId ?? null;
  let assistantText = "";
  let reasoning = "";
  /** tool start events keyed by id, so the matching end can enrich them. */
  const toolStarts = new Map<string, ToolRecord>();
  const tools: ToolRecord[] = [];
  let usage: NormalizedUsage | null = null;
  let finished = false;

  try {
    for await (const event of engineSession.runTurn({
      prompt: req.prompt,
      modelAlias: req.model || agent.defaultModel,
      // The concrete id the alias resolves to (already computed above for the
      // turn record). The engine switches the live query to THIS, because the
      // runtime set_model control request doesn't resolve role aliases via env.
      model,
      mode,
      onApproval: (request) =>
        new Promise((resolve) => {
          flight.pending.set(request.approvalId, { kind: "approval", resolve });
          emit({
            type: "approval",
            approvalId: request.approvalId,
            title: request.title,
            diff: request.diff,
          });
        }),
      onQuestion: (request) =>
        new Promise((resolve) => {
          flight.pending.set(request.questionId, { kind: "question", resolve });
          emit({
            type: "question",
            questionId: request.questionId,
            kind: request.kind,
            prompt: request.prompt,
            options: request.options,
            allowFreeText: request.allowFreeText,
          });
        }),
    })) {
      switch (event.type) {
        case "thread":
          nativeThreadId = event.nativeThreadId;
          break;
        case "text":
          assistantText += event.text;
          break;
        case "reasoning":
          reasoning += event.text;
          break;
        case "tool":
          if (event.phase === "start") {
            const record: ToolRecord = {
              name: event.name,
              detail: event.detail,
            };
            toolStarts.set(event.id, record);
            tools.push(record);
          } else if (event.detail) {
            const start = toolStarts.get(event.id);
            if (start && !start.detail) start.detail = event.detail;
          }
          break;
        case "result":
          usage = event.usage;
          if (!assistantText) assistantText = event.text;
          break;
      }
      emit(event);
    }

    await addMessage({
      sessionId: req.sessionId,
      turnId,
      role: "assistant",
      content: assistantText,
      reasoning,
      tools: JSON.stringify(tools),
      engine: agent.engine,
    });
    await finishTurn(req.sessionId, {
      status: "done",
      nativeThreadId,
      usage,
      model,
    });
    finished = true;
  } catch (err) {
    emit({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    rejectPending(flight);
    if (!finished) {
      // Still persist whatever the engine produced before it failed/aborted.
      await addMessage({
        sessionId: req.sessionId,
        turnId,
        role: "assistant",
        content: assistantText,
        reasoning,
        tools: JSON.stringify(tools),
        engine: agent.engine,
      });
      // R4 guard lives in `finishTurn`: on an error turn a null `nativeThreadId`
      // must NOT clobber a previously-good resume handle.
      await finishTurn(req.sessionId, {
        status: "error",
        nativeThreadId,
        usage,
        model,
      });
    }
    // Remember the workspace's last mode + agent so the composer can restore it.
    if (session.workspaceId) {
      await rememberSelection(session.workspaceId, mode.id, req.agentId);
    }
    inFlight.delete(req.id);
    markIdle(req.sessionId, req.id);
    // Restart the session's idle clock; it can now be evicted when idle.
    releaseSession(req.sessionId);
  }
}
