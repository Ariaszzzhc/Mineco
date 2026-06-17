import { randomUUID } from "node:crypto";
import type { EngineId, Message } from "../../src/lib/agent-protocol";
import { getDb } from "./index";

/** The canonical engine-neutral transcript for a session, oldest first. */
export async function listMessages(sessionId: string): Promise<Message[]> {
  const rows = await getDb()
    .selectFrom("messages")
    .selectAll()
    .where("sessionId", "=", sessionId)
    .orderBy("createdAt")
    .execute();
  return rows.map((r) => ({ ...r, engine: r.engine as EngineId | null }));
}

export async function addMessage(input: {
  sessionId: string;
  turnId: string;
  role: Message["role"];
  content: string;
  reasoning?: string;
  tools?: string;
  engine: EngineId | null;
}): Promise<Message> {
  const message: Message = {
    id: randomUUID(),
    sessionId: input.sessionId,
    turnId: input.turnId,
    role: input.role,
    content: input.content,
    reasoning: input.reasoning ?? "",
    tools: input.tools ?? "[]",
    engine: input.engine,
    createdAt: Date.now(),
  };
  await getDb().insertInto("messages").values(message).execute();
  return message;
}
