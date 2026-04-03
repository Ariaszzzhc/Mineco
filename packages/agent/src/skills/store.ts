import type { SkillManifest } from "./types.js";

export class SkillStore {
  private skills = new Map<string, SkillManifest>();
  private activated = new Set<string>();

  constructor(skills: SkillManifest[]) {
    for (const skill of skills) {
      const existing = this.skills.get(skill.name);
      if (!existing) {
        this.skills.set(skill.name, skill);
      } else if (skill.source === "project" && existing.source === "user") {
        console.warn(
          `[skills] "${skill.name}" from project overrides user-level skill`,
        );
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

  isActivated(name: string): boolean {
    return this.activated.has(name);
  }

  markActivated(name: string): void {
    this.activated.add(name);
  }
}
