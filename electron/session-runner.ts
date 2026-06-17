import type {
  Message,
  NormalizedEvent,
  NormalizedUsage,
  ToolRecord,
  TurnRunRequest,
} from "../src/lib/agent-protocol";
import { getAgent } from "./db/agents";
import { listMcp } from "./db/mcp";
import { listMemory } from "./db/memory";
import { addMessage, listMessages } from "./db/messages";
import { getSession, setSessionStatus, setSessionTitle } from "./db/sessions";
import { createTurn, finishTurn, getLastTurn } from "./db/turns";
import { getEngine } from "./engines/registry";

/** In-flight turns, so the abort IPC can cancel a running engine. */
const inFlight = new Map<string, AbortController>();

export function abortTurn(requestId: string): void {
  inFlight.get(requestId)?.abort();
}

/** Derives a short session title from the first user prompt (~48 chars). */
function deriveTitle(prompt: string): string {
  const flat = prompt.trim().replace(/\s+/g, " ");
  return flat.length > 48 ? `${flat.slice(0, 47)}…` : flat || "Untitled";
}

/**
 * Runs one turn end-to-end: resolves the agent + workspace memory + MCP + mode
 * + model, picks the engine from the agent, decides between native resume (same
 * engine as last turn) and transcript rehydration (engine switch / first turn),
 * streams normalized events to `emit`, persists the canonical message + turn
 * rows (assistant message carries concatenated reasoning + a tools JSON array),
 * tracks session status, and auto-titles the session from its first prompt.
 */
export async function runTurn(
  req: TurnRunRequest,
  emit: (event: NormalizedEvent) => void,
): Promise<void> {
  const [session, agent] = await Promise.all([
    getSession(req.sessionId),
    getAgent(req.agentId),
  ]);
  if (!session || !agent) {
    emit({ type: "error", message: "Unknown session or agent." });
    return;
  }

  // The renderer passes a concrete model; for Claude this is the resolved alias.
  const model = req.model || agent.model;

  // Same engine as the last completed turn → cheap native resume. Otherwise
  // (engine switch or first turn) rehydrate the new engine with the prior
  // transcript, captured BEFORE we record this turn's user message.
  const lastTurn = await getLastTurn(req.sessionId);
  const canResume =
    lastTurn?.engine === agent.engine && lastTurn.nativeThreadId
      ? { nativeThreadId: lastTurn.nativeThreadId }
      : undefined;

  const [seedHistory, memory, mcpServers] = await Promise.all([
    canResume
      ? Promise.resolve<Message[] | undefined>(undefined)
      : listMessages(req.sessionId),
    session.workspaceId ? listMemory(session.workspaceId) : Promise.resolve([]),
    listMcp(),
  ]);

  const turn = await createTurn({
    sessionId: req.sessionId,
    agentId: req.agentId,
    engine: agent.engine,
    mode: req.mode,
    model,
  });
  await addMessage({
    sessionId: req.sessionId,
    turnId: turn.id,
    role: "user",
    content: req.prompt,
    engine: null,
  });

  // Auto-title an as-yet-untitled session from its first user prompt.
  if (session.title === "Untitled") {
    const title = deriveTitle(req.prompt);
    await setSessionTitle(req.sessionId, title);
  }

  await setSessionStatus(req.sessionId, "running");

  const controller = new AbortController();
  inFlight.set(req.id, controller);

  let nativeThreadId: string | null = null;
  let assistantText = "";
  let reasoning = "";
  const tools: ToolRecord[] = [];
  let usage: NormalizedUsage | null = null;
  let finished = false;

  try {
    for await (const event of getEngine(agent.engine).run({
      prompt: req.prompt,
      cwd: session.cwd,
      agent,
      model,
      mode: req.mode,
      memory,
      mcpServers,
      resume: canResume,
      seedHistory,
      signal: controller.signal,
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
          tools.push({ name: event.name, detail: event.detail });
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
    await setSessionStatus(req.sessionId, "idle");
    finished = true;
  } catch (err) {
    emit({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (!finished) {
      await finishTurn({ id: turn.id, status: "error", nativeThreadId, usage });
      await setSessionStatus(req.sessionId, "error");
    }
    inFlight.delete(req.id);
  }
}
