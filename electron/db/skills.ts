import { randomUUID } from "node:crypto";
import type { Selectable } from "kysely";
import type { Skill } from "../../src/lib/agent-protocol";
import { getDb } from "./index";
import type { Database } from "./schema";

/** SQLite stores `enabled` as 0/1; map it back to a boolean. */
function toSkill(row: Selectable<Database["skills"]>): Skill {
  return { ...row, enabled: !!row.enabled };
}

export async function listSkills(): Promise<Skill[]> {
  const rows = await getDb()
    .selectFrom("skills")
    .selectAll()
    .orderBy("createdAt")
    .execute();
  return rows.map(toSkill);
}

export async function createSkill(input: {
  name: string;
  description: string;
  scope: Skill["scope"];
  source: string;
  enabled: boolean;
}): Promise<Skill> {
  const skill: Skill = { id: randomUUID(), ...input, createdAt: Date.now() };
  await getDb()
    .insertInto("skills")
    .values({ ...skill, enabled: skill.enabled ? 1 : 0 })
    .execute();
  return skill;
}

export async function updateSkill(skill: Skill): Promise<void> {
  await getDb()
    .updateTable("skills")
    .set({
      name: skill.name,
      description: skill.description,
      scope: skill.scope,
      source: skill.source,
      enabled: skill.enabled ? 1 : 0,
    })
    .where("id", "=", skill.id)
    .execute();
}

export async function deleteSkill(id: string): Promise<void> {
  await getDb().deleteFrom("skills").where("id", "=", id).execute();
}
