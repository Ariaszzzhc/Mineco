import { randomUUID } from "node:crypto";
import type { MemoryEntry } from "../../src/lib/agent-protocol";
import { getDb } from "./index";

export function listMemory(workspaceId: string): Promise<MemoryEntry[]> {
  return getDb()
    .selectFrom("memoryEntries")
    .selectAll()
    .where("workspaceId", "=", workspaceId)
    .orderBy("createdAt")
    .execute();
}

export async function createMemory(input: {
  workspaceId: string;
  kind: MemoryEntry["kind"];
  text: string;
}): Promise<MemoryEntry> {
  const entry: MemoryEntry = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    kind: input.kind,
    text: input.text,
    createdAt: Date.now(),
  };
  await getDb().insertInto("memoryEntries").values(entry).execute();
  return entry;
}

export async function updateMemory(entry: MemoryEntry): Promise<void> {
  await getDb()
    .updateTable("memoryEntries")
    .set({ kind: entry.kind, text: entry.text })
    .where("id", "=", entry.id)
    .execute();
}

export async function deleteMemory(id: string): Promise<void> {
  await getDb().deleteFrom("memoryEntries").where("id", "=", id).execute();
}
