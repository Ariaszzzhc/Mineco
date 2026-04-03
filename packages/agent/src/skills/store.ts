import type { SkillManifest } from "./types.js";

export class SkillStore {
  private skills = new Map<string, SkillManifest>();

  constructor(skills: SkillManifest[]) {
    for (const skill of skills) {
      const existing = this.skills.get(skill.name);
      if (!existing || skill.source === "project") {
        this.skills.set(skill.name, skill);
      }
    }
  }

  get(name: string): SkillManifest | undefined {
    return this.skills.get(name);
  }

  getAll(): SkillManifest[] {
    return Array.from(this.skills.values());
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }
}
