import { randomUUID } from "node:crypto";
import type { Session } from "@/shared/agent-protocol";
import { getDb } from "./index";

/** Lists sessions, optionally filtered to one workspace. Pass `undefined` for
 * all sessions, or `null` for the public/shared (no-workspace) space. Returns
 * plain {@link Session} rows — main.ts merges in-memory run state to produce
 * `SessionView`. */
export function listSessions(workspaceId?: string | null): Promise<Session[]> {
  let q = getDb().selectFrom("sessions").selectAll();
  if (workspaceId !== undefined) {
    q =
      workspaceId === null
        ? q.where("workspaceId", "is", null)
        : q.where("workspaceId", "=", workspaceId);
  }
  return q.orderBy("createdAt", "desc").execute();
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
  workspaceId: string | null;
  agentId: string | null;
  title?: string;
  cwd: string;
}): Promise<Session> {
  const session: Session = {
    id: randomUUID(),
    workspaceId: input.workspaceId ?? null,
    agentId: input.agentId ?? null,
    title: input.title?.trim() || "Untitled",
    cwd: input.cwd,
    createdAt: Date.now(),
  };
  await getDb().insertInto("sessions").values(session).execute();
  return session;
}

export async function setSessionTitle(
  id: string,
  title: string,
): Promise<void> {
  await getDb()
    .updateTable("sessions")
    .set({ title })
    .where("id", "=", id)
    .execute();
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb();
  await db.deleteFrom("messages").where("sessionId", "=", id).execute();
  await db.deleteFrom("turns").where("sessionId", "=", id).execute();
  await db.deleteFrom("sessions").where("id", "=", id).execute();
}
