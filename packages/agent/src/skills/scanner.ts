import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
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

    const parsed = parseFrontmatter(raw);
    if (!parsed) return null;

    const frontmatter = SkillFrontmatterSchema.safeParse(parsed.data);
    if (!frontmatter.success) {
      return null;
    }

    return {
      name: frontmatter.data.name,
      description: frontmatter.data.description,
      instructions: parsed.body.trim(),
      sourcePath: filePath,
      source,
    };
  }
}

function parseFrontmatter(
  content: string,
): { data: Record<string, unknown>; body: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return null;

  const data: Record<string, unknown> = {};
  const lines = match[1]!.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    if (!rawValue) continue;

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      data[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim());
    } else {
      data[key] = rawValue;
    }
  }

  return { data, body: match[2] ?? "" };
}
