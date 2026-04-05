import type { SkillStore } from "./store.js";
import type { SkillManifest } from "./types.js";

export interface ResolvedSlashSkill {
  skill: SkillManifest;
  remaining: string;
}

export function resolveSlashSkill(
  message: string,
  store: SkillStore,
): ResolvedSlashSkill | null {
  const trimmed = message.trimStart();
  if (!trimmed.startsWith("/")) return null;

  const spaceIdx = trimmed.indexOf(" ");
  const skillName = (
    spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)
  ).trim();

  if (!skillName) return null;

  const skill = store.get(skillName);
  if (!skill) return null;

  const remaining = (spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1)).trim();

  return { skill, remaining };
}
