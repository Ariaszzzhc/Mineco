import { randomUUID } from "node:crypto";
import type { Selectable } from "kysely";
import type { NormalizedUsage } from "../../src/lib/agent-protocol";
import { getDb } from "./index";
import type { Database } from "./schema";

/** A persisted turn with `usageJson` decoded back to a `NormalizedUsage`. The
 * canonical engine-neutral turn record (mineco.db only; no agent-protocol type
 * since turns are an internal persistence concern). */
export interface Turn {
  id: string;
  sessionId: string;
  agentId: string;
  /** Run mode id (string). */
  mode: string | null;
  /** Human-readable run-mode label captured at turn time. */
  modeLabel: string | null;
  model: string | null;
  nativeThreadId: string | null;
  usage: NormalizedUsage | null;
  status: string;
  createdAt: number;
}

/** Maps a DB row (usage stored as JSON) to a {@link Turn}. */
function toTurn(row: Selectable<Database["turns"]>): Turn {
  const { usageJson, ...rest } = row;
  return {
    ...rest,
    usage: usageJson ? (JSON.parse(usageJson) as NormalizedUsage) : null,
  };
}

export async function createTurn(input: {
  sessionId: string;
  agentId: string;
  mode: string | null;
  modeLabel?: string | null;
  model: string | null;
}): Promise<Turn> {
  const turn: Turn = {
    id: randomUUID(),
    sessionId: input.sessionId,
    agentId: input.agentId,
    mode: input.mode,
    modeLabel: input.modeLabel ?? null,
    model: input.model,
    nativeThreadId: null,
    usage: null,
    status: "running",
    createdAt: Date.now(),
  };
  await getDb()
    .insertInto("turns")
    .values({
      id: turn.id,
      sessionId: turn.sessionId,
      agentId: turn.agentId,
      mode: turn.mode,
      modeLabel: turn.modeLabel,
      model: turn.model,
      nativeThreadId: null,
      usageJson: null,
      status: turn.status,
      createdAt: turn.createdAt,
    })
    .execute();
  return turn;
}

export async function finishTurn(input: {
  id: string;
  status: "done" | "error";
  nativeThreadId: string | null;
  usage: NormalizedUsage | null;
}): Promise<void> {
  await getDb()
    .updateTable("turns")
    .set({
      status: input.status,
      nativeThreadId: input.nativeThreadId,
      usageJson: input.usage ? JSON.stringify(input.usage) : null,
    })
    .where("id", "=", input.id)
    .execute();
}

/** The most recent completed turn for a session — drives the resume-vs-seed
 * decision when switching agents. */
export async function getLastTurn(sessionId: string): Promise<Turn | null> {
  const row = await getDb()
    .selectFrom("turns")
    .selectAll()
    .where("sessionId", "=", sessionId)
    .where("status", "=", "done")
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst();
  return row ? toTurn(row) : null;
}
