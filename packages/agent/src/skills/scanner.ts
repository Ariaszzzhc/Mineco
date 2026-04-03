import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import matter from "gray-matter";
import type { SkillManifest } from "./types.js";
import { SkillFrontmatterSchema } from "./types.js";

export class SkillScanner {
  async scan(
    workingDir: string,
    options?: { userSkillsDir?: string },
  ): Promise<SkillManifest[]> {
    const userSkills = await this.scanDirectory(
      options?.userSkillsDir ?? join(homedir(), ".agents", "skills"),
      "user",
    );
    const projectSkills = await this.scanDirectory(
      join(workingDir, ".agents", "skills"),
      "project",
    );
    return [...userSkills, ...projectSkills];
  }

  private async scanDirectory(
    dir: string,
    source: "user" | "project",
  ): Promise<SkillManifest[]> {
    const skills: SkillManifest[] = [];
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return skills;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillMdPath = join(dir, entry.name, "SKILL.md");
      const manifest = await this.parseSkillFile(skillMdPath, source);
      if (manifest) {
        skills.push(manifest);
      }
    }
    return skills;
  }

  private async parseSkillFile(
    filePath: string,
    source: "user" | "project",
  ): Promise<SkillManifest | null> {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch {
      return null;
    }

    let parsed;
    try {
      parsed = matter(raw);
    } catch {
      return null;
    }

    const frontmatter = SkillFrontmatterSchema.safeParse(parsed.data);
    if (!frontmatter.success) {
      return null;
    }

    return {
      name: frontmatter.data.name,
      description: frontmatter.data.description,
      instructions: parsed.content.trim(),
      sourcePath: filePath,
      source,
    };
  }
}
