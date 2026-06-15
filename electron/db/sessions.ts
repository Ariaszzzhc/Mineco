import { randomUUID } from "node:crypto";
import type { Session } from "../../src/lib/agent-protocol";
import { getDb } from "./index";

export function listSessions(): Promise<Session[]> {
  return getDb()
    .selectFrom("sessions")
    .selectAll()
    .orderBy("createdAt", "desc")
    .execute();
}

export async function getSession(id: string): Promise<Session | null> {
  const row = await getDb()
    .selectFrom("sessions")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function createSession(input: {
  title?: string;
  cwd: string;
}): Promise<Session> {
  const session: Session = {
    id: randomUUID(),
    title: input.title?.trim() || "Untitled session",
    cwd: input.cwd,
    createdAt: Date.now(),
  };
  await getDb().insertInto("sessions").values(session).execute();
  return session;
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb();
  await db.deleteFrom("messages").where("sessionId", "=", id).execute();
  await db.deleteFrom("turns").where("sessionId", "=", id).execute();
  await db.deleteFrom("sessions").where("id", "=", id).execute();
}
