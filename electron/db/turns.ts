import { randomUUID } from "node:crypto";
import type { Selectable } from "kysely";
import type {
  NormalizedUsage,
  RunMode,
  TurnRecord,
} from "../../src/lib/agent-protocol";
import { getDb } from "./index";
import type { Database } from "./schema";

/** Maps a DB row (usage stored as JSON) to the domain `TurnRecord`. */
function toTurn(row: Selectable<Database["turns"]>): TurnRecord {
  const { usageJson, ...rest } = row;
  return {
    ...rest,
    usage: usageJson ? (JSON.parse(usageJson) as NormalizedUsage) : null,
  };
}

export async function createTurn(input: {
  sessionId: string;
  agentId: string;
  engine: TurnRecord["engine"];
  mode: RunMode;
  model: string;
}): Promise<TurnRecord> {
  const turn: TurnRecord = {
    id: randomUUID(),
    sessionId: input.sessionId,
    agentId: input.agentId,
    engine: input.engine,
    mode: input.mode,
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
      engine: turn.engine,
      mode: turn.mode,
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
 * decision when switching engines. */
export async function getLastTurn(
  sessionId: string,
): Promise<TurnRecord | null> {
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
