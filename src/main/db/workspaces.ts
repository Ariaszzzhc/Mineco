import { randomUUID } from "node:crypto";
import type { Workspace } from "@/shared/agent-protocol";
import { getDb } from "./index";

export function listWorkspaces(): Promise<Workspace[]> {
  return getDb()
    .selectFrom("workspaces")
    .selectAll()
    .orderBy("createdAt")
    .execute();
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const row = await getDb()
    .selectFrom("workspaces")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function createWorkspace(input: {
  name: string;
  /** Absolute project path, or null for the public/shared workspace. */
  rootPath: string | null;
}): Promise<Workspace> {
  const workspace: Workspace = {
    id: randomUUID(),
    name: input.name.trim() || "Workspace",
    rootPath: input.rootPath,
    lastMode: null,
    lastAgentId: null,
    createdAt: Date.now(),
  };
  await getDb().insertInto("workspaces").values(workspace).execute();
  return workspace;
}

export async function updateWorkspace(input: {
  id: string;
  name: string;
  rootPath: string | null;
}): Promise<void> {
  await getDb()
    .updateTable("workspaces")
    .set({ name: input.name, rootPath: input.rootPath })
    .where("id", "=", input.id)
    .execute();
}

export async function deleteWorkspace(id: string): Promise<void> {
  await getDb().deleteFrom("workspaces").where("id", "=", id).execute();
}

/** Records the last-used run mode + agent for a workspace, so the composer can
 * restore the user's selection when they return to it. */
export async function setLastSelection(
  id: string,
  mode: string | null,
  agentId: string | null,
): Promise<void> {
  await getDb()
    .updateTable("workspaces")
    .set({ lastMode: mode, lastAgentId: agentId })
    .where("id", "=", id)
    .execute();
}

/** Ensures a single public/shared workspace (`rootPath` null) exists and returns
 * it. Idempotent: reuses the existing one if present. */
export async function ensurePublicWorkspace(): Promise<Workspace> {
  const existing = await getDb()
    .selectFrom("workspaces")
    .selectAll()
    .where("rootPath", "is", null)
    .orderBy("createdAt")
    .executeTakeFirst();
  if (existing) return existing;
  return createWorkspace({ name: "Public", rootPath: null });
}
