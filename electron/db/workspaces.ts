import { randomUUID } from "node:crypto";
import type { Workspace } from "../../src/lib/agent-protocol";
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
  path: string;
}): Promise<Workspace> {
  const workspace: Workspace = {
    id: randomUUID(),
    name: input.name.trim() || "Workspace",
    path: input.path,
    createdAt: Date.now(),
  };
  await getDb().insertInto("workspaces").values(workspace).execute();
  return workspace;
}

export async function updateWorkspace(workspace: Workspace): Promise<void> {
  await getDb()
    .updateTable("workspaces")
    .set({ name: workspace.name, path: workspace.path })
    .where("id", "=", workspace.id)
    .execute();
}

export async function deleteWorkspace(id: string): Promise<void> {
  await getDb().deleteFrom("workspaces").where("id", "=", id).execute();
}
