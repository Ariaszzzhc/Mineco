import type {
  Message,
  NormalizedEvent,
  NormalizedUsage,
  TurnRunRequest,
} from "../src/lib/agent-protocol";
import { addMessage, listMessages } from "./db/messages";
import { getProfile } from "./db/profiles";
import { getSession } from "./db/sessions";
import { createTurn, finishTurn, getLastTurn } from "./db/turns";
import { getEngine } from "./engines/registry";

/** In-flight turns, so the abort IPC can cancel a running engine. */
const inFlight = new Map<string, AbortController>();

export function abortTurn(requestId: string): void {
  inFlight.get(requestId)?.abort();
}

/**
 * Runs one turn end-to-end: picks the engine from the request's profile,
 * decides between native resume (same engine as last turn) and transcript
 * rehydration (engine switch / first turn), streams normalized events to
 * `emit`, and persists the canonical message + turn rows.
 */
export async function runTurn(
  req: TurnRunRequest,
  emit: (event: NormalizedEvent) => void,
): Promise<void> {
  const [session, profile] = await Promise.all([
    getSession(req.sessionId),
    getProfile(req.profileId),
  ]);
  if (!session || !profile) {
    emit({ type: "error", message: "Unknown session or profile." });
    return;
  }

  // Same engine as the last completed turn → cheap native resume. Otherwise
  // (engine switch or first turn) rehydrate the new engine with the prior
  // transcript, captured BEFORE we record this turn's user message.
  const lastTurn = await getLastTurn(req.sessionId);
  const canResume =
    lastTurn?.engine === profile.engine && lastTurn.nativeThreadId
      ? { nativeThreadId: lastTurn.nativeThreadId }
      : undefined;
  const seedHistory: Message[] | undefined = canResume
    ? undefined
    : await listMessages(req.sessionId);

  const turn = await createTurn({
    sessionId: req.sessionId,
    profileId: req.profileId,
    engine: profile.engine,
  });
  await addMessage({
    sessionId: req.sessionId,
    turnId: turn.id,
    role: "user",
    content: req.prompt,
    engine: null,
  });

  const controller = new AbortController();
  inFlight.set(req.id, controller);

  let nativeThreadId: string | null = null;
  let assistantText = "";
  let usage: NormalizedUsage | null = null;
  let finished = false;

  try {
    for await (const event of getEngine(profile.engine).run({
      prompt: req.prompt,
      cwd: session.cwd,
      profile,
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
      engine: profile.engine,
    });
    await finishTurn({ id: turn.id, status: "done", nativeThreadId, usage });
    finished = true;
  } catch (err) {
    emit({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    if (!finished) {
      await finishTurn({ id: turn.id, status: "error", nativeThreadId, usage });
    }
    inFlight.delete(req.id);
  }
}
