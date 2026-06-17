import { randomUUID } from "node:crypto";
import type { Selectable } from "kysely";
import type { McpServer } from "../../src/lib/agent-protocol";
import { getDb } from "./index";
import type { Database } from "./schema";

/** SQLite stores `enabled` as 0/1; map it back to a boolean. */
function toMcp(row: Selectable<Database["mcpServers"]>): McpServer {
  return { ...row, enabled: !!row.enabled };
}

export async function listMcp(): Promise<McpServer[]> {
  const rows = await getDb()
    .selectFrom("mcpServers")
    .selectAll()
    .orderBy("createdAt")
    .execute();
  return rows.map(toMcp);
}

export async function createMcp(input: {
  name: string;
  transport: McpServer["transport"];
  scope: McpServer["scope"];
  enabled: boolean;
  command: string;
  env: string;
}): Promise<McpServer> {
  const server: McpServer = {
    id: randomUUID(),
    ...input,
    createdAt: Date.now(),
  };
  await getDb()
    .insertInto("mcpServers")
    .values({ ...server, enabled: server.enabled ? 1 : 0 })
    .execute();
  return server;
}

export async function updateMcp(server: McpServer): Promise<void> {
  await getDb()
    .updateTable("mcpServers")
    .set({
      name: server.name,
      transport: server.transport,
      scope: server.scope,
      enabled: server.enabled ? 1 : 0,
      command: server.command,
      env: server.env,
    })
    .where("id", "=", server.id)
    .execute();
}

export async function deleteMcp(id: string): Promise<void> {
  await getDb().deleteFrom("mcpServers").where("id", "=", id).execute();
}
