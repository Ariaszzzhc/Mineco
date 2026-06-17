import { randomUUID } from "node:crypto";
import type { Selectable } from "kysely";
import type { Agent, AgentInput } from "../../src/lib/agent-protocol";
import { getDb } from "./index";
import type { Database } from "./schema";

/** Maps a DB row (models stored as JSON) to the domain `Agent`. */
function toAgent(row: Selectable<Database["agents"]>): Agent {
  const { modelsJson, ...rest } = row;
  let models: Agent["models"] = { sonnet: "", opus: "", haiku: "" };
  try {
    models = { ...models, ...(JSON.parse(modelsJson || "{}") as object) };
  } catch {
    // Corrupt JSON — fall back to empty aliases.
  }
  return { ...rest, models };
}

export async function listAgents(): Promise<Agent[]> {
  const rows = await getDb()
    .selectFrom("agents")
    .selectAll()
    .orderBy("createdAt")
    .execute();
  return rows.map(toAgent);
}

export async function getAgent(id: string): Promise<Agent | null> {
  const row = await getDb()
    .selectFrom("agents")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ? toAgent(row) : null;
}

export async function createAgent(input: AgentInput): Promise<Agent> {
  const agent: Agent = { id: randomUUID(), createdAt: Date.now(), ...input };
  await getDb()
    .insertInto("agents")
    .values({
      id: agent.id,
      name: agent.name,
      engine: agent.engine,
      baseUrl: agent.baseUrl,
      apiKey: agent.apiKey,
      modelsJson: JSON.stringify(agent.models),
      model: agent.model,
      effort: agent.effort,
      systemPrompt: agent.systemPrompt,
      promptMode: agent.promptMode,
      createdAt: agent.createdAt,
    })
    .execute();
  return agent;
}

export async function updateAgent(agent: Agent): Promise<void> {
  await getDb()
    .updateTable("agents")
    .set({
      name: agent.name,
      engine: agent.engine,
      baseUrl: agent.baseUrl,
      apiKey: agent.apiKey,
      modelsJson: JSON.stringify(agent.models),
      model: agent.model,
      effort: agent.effort,
      systemPrompt: agent.systemPrompt,
      promptMode: agent.promptMode,
    })
    .where("id", "=", agent.id)
    .execute();
}

export async function deleteAgent(id: string): Promise<void> {
  await getDb().deleteFrom("agents").where("id", "=", id).execute();
}
