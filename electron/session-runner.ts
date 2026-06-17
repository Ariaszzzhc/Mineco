/**
 * Session runner — orchestrates one turn end-to-end (EDD §6.1).
 *
 * Responsibilities for `runTurn(req, emit)`:
 *   1. Load the session + the selected Agent (filesystem-backed) + the owning
 *      workspace; resolve the chosen model alias to a concrete id.
 *   2. Look up the {@link RunMode} object from the Claude engine's static
 *      capabilities by `req.mode` id (falling back to `default`).
 *   3. Assemble the per-turn injection context (global instructions + memory +
 *      MCP servers) via the context-assembly service.
 *   4. Decide resume-vs-seed by AGENT IDENTITY: if the session is already bound
 *      to `req.agentId` AND its last completed turn carries a `nativeThreadId`,
 *      resume that native thread; otherwise start fresh, rehydrating the new
 *      agent with the prior transcript (`seedHistory`, captured BEFORE this
 *      turn's user message is recorded), and rebind the session to the agent.
 *   5. Persist the turn + the user message, auto-title the session from its
 *      first prompt, and mark the session running in the in-memory run registry.
 *   6. Stream normalized events to `emit`, bridging mid-turn `question` /
 *      `approval` requests back to the renderer via a pending-response map that
 *      {@link resolveTurnResponse} resolves.
 *   7. On completion, persist the assistant message (concatenated reasoning + a
 *      tools JSON array), finish the turn, remember the workspace's last mode +
 *      agent selection, and mark the session idle.
 *
 * Run state lives ONLY in the in-memory run registry (never the DB).
 */

import type {
  Message,
  NormalizedEvent,
  NormalizedUsage,
  RunMode,
  ToolRecord,
  TurnResponse,
  TurnRunRequest,
} from "../src/lib/agent-protocol";
import { getDb } from "./db/index";
import { addMessage, listMessages } from "./db/messages";
import { getSession, setSessionTitle } from "./db/sessions";
import { createTurn, finishTurn, getLastTurn } from "./db/turns";
import { claudeEngine } from "./engines/claude";
import { getAgentDetail, resolveModel } from "./services/agent";
import { assembleContext } from "./services/context-assembly";
import {
  markIdle,
  markRunning,
  type RunStateListener,
  setListener,
} from "./services/run-registry";
import { rememberSelection } from "./services/workspace";

/**
 * Per-request orchestration state for an in-flight turn. Holds the abort
 * controller and the bridge that resolves mid-turn question/approval requests
 * when the renderer answers via {@link resolveTurnResponse}.
 */
interface InFlight {
  controller: AbortController;
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

/** Aborts a running turn (no-op if it already finished). */
export function abortTurn(requestId: string): void {
  inFlight.get(requestId)?.controller.abort();
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

  // Resolve the chosen alias to a concrete model id (or the alias itself, which
  // lets the agent's settings.json env drive selection).
  const model = await resolveModel(
    req.agentId,
    req.model || agent.defaultModel,
  );
  const mode = resolveMode(req.mode);

  // Resume-vs-seed by AGENT IDENTITY: only resume the native thread when the
  // session is already bound to this same agent AND the last completed turn
  // captured a native thread id (resume is valid only within one config dir).
  const lastTurn = await getLastTurn(req.sessionId);
  const canResume =
    session.agentId === req.agentId && lastTurn?.nativeThreadId
      ? { nativeThreadId: lastTurn.nativeThreadId }
      : undefined;

  // Capture the prior transcript BEFORE recording this turn's user message —
  // only needed when starting a fresh native thread (agent switch / first turn).
  const [seedHistory, ctx] = await Promise.all([
    canResume
      ? Promise.resolve<Message[] | undefined>(undefined)
      : listMessages(req.sessionId),
    assembleContext({ workspaceId: session.workspaceId }),
  ]);

  const turn = await createTurn({
    sessionId: req.sessionId,
    agentId: req.agentId,
    mode: mode.id,
    modeLabel: mode.label,
    model,
  });
  await addMessage({
    sessionId: req.sessionId,
    turnId: turn.id,
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

  const flight: InFlight = {
    controller: new AbortController(),
    pending: new Map(),
  };
  inFlight.set(req.id, flight);
  markRunning(req.sessionId, req.id);

  let nativeThreadId: string | null = null;
  let assistantText = "";
  let reasoning = "";
  /** tool start events keyed by id, so the matching end can enrich them. */
  const toolStarts = new Map<string, ToolRecord>();
  const tools: ToolRecord[] = [];
  let usage: NormalizedUsage | null = null;
  let finished = false;

  try {
    for await (const event of claudeEngine.run({
      prompt: req.prompt,
      cwd: session.cwd,
      agent,
      modelAlias: req.model || agent.defaultModel,
      mode,
      globalInstructions: ctx.globalInstructions,
      memory: ctx.memory,
      mcpServers: ctx.mcpServers,
      resume: canResume,
      seedHistory,
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
      signal: flight.controller.signal,
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
            // Enrich the matching start record if the end carries more detail.
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
      turnId: turn.id,
      role: "assistant",
      content: assistantText,
      reasoning,
      tools: JSON.stringify(tools),
      engine: agent.engine,
    });
    await finishTurn({ id: turn.id, status: "done", nativeThreadId, usage });
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
        turnId: turn.id,
        role: "assistant",
        content: assistantText,
        reasoning,
        tools: JSON.stringify(tools),
        engine: agent.engine,
      });
      await finishTurn({ id: turn.id, status: "error", nativeThreadId, usage });
    }
    // Remember the workspace's last mode + agent so the composer can restore it.
    if (session.workspaceId) {
      await rememberSelection(session.workspaceId, mode.id, req.agentId);
    }
    inFlight.delete(req.id);
    markIdle(req.sessionId, req.id);
  }
}

/** Rebinds a session row to a (possibly new) agent id. */
async function rebindSessionAgent(
  sessionId: string,
  agentId: string,
): Promise<void> {
  await getDb()
    .updateTable("sessions")
    .set({ agentId })
    .where("id", "=", sessionId)
    .execute();
}
