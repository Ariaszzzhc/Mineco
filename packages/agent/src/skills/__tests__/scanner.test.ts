import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SkillScanner } from "../scanner.js";
import { SkillStore } from "../store.js";
import { buildSkillCatalogText } from "../catalog.js";
import { resolveSlashSkill } from "../resolve.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("SkillScanner", () => {
  let scanner: SkillScanner;
  let tmpDir: string;

  beforeEach(async () => {
    scanner = new SkillScanner();
    tmpDir = await mkd(join(tmpdir(), "mineco-skill-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("should return empty array when no skills directory exists", async () => {
    const skills = await scanner.scan(tmpDir);
    expect(skills).toEqual([]);
  });

  it("should discover a valid skill", async () => {
    const skillDir = join(tmpDir, ".agents", "skills", "test-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\nname: test-skill\ndescription: A test skill for testing\n---\n\nDo the thing.`,
    );

    const skills = await scanner.scan(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe("test-skill");
    expect(skills[0]!.description).toBe("A test skill for testing");
    expect(skills[0]!.instructions).toBe("Do the thing.");
    expect(skills[0]!.sourcePath).toBe(join(skillDir, "SKILL.md"));
  });

  it("should skip directories without SKILL.md", async () => {
    const skillDir = join(tmpDir, ".agents", "skills", "no-skill-md");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "README.md"), "This is not a skill");

    const skills = await scanner.scan(tmpDir);
    expect(skills).toEqual([]);
  });

  it("should skip skills with invalid frontmatter", async () => {
    const skillDir = join(tmpDir, ".agents", "skills", "bad-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "No frontmatter here");

    const skills = await scanner.scan(tmpDir);
    expect(skills).toEqual([]);
  });

  it("should skip skills missing required name field", async () => {
    const skillDir = join(tmpDir, ".agents", "skills", "no-name");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---\ndescription: Missing name\n---\n\nContent.`,
    );

    const skills = await scanner.scan(tmpDir);
    expect(skills).toEqual([]);
  });
});

describe("SkillStore", () => {
  it("should retrieve skills by name", () => {
    const store = new SkillStore([
      { name: "commit", description: "Smart commits", instructions: "do it", sourcePath: "/a", source: "user" },
    ]);
    expect(store.get("commit")).toBeDefined();
    expect(store.get("commit")!.name).toBe("commit");
  });

  it("should return undefined for unknown skill", () => {
    const store = new SkillStore([]);
    expect(store.get("unknown")).toBeUndefined();
  });

  it("should override user skill with project skill on collision", () => {
    const store = new SkillStore([
      { name: "review", description: "user review", instructions: "user", sourcePath: "/a", source: "user" },
      { name: "review", description: "project review", instructions: "project", sourcePath: "/b", source: "project" },
    ]);
    expect(store.get("review")!.description).toBe("project review");
  });

  it("should not override project skill with user skill", () => {
    const store = new SkillStore([
      { name: "review", description: "project review", instructions: "project", sourcePath: "/b", source: "project" },
      { name: "review", description: "user review", instructions: "user", sourcePath: "/a", source: "user" },
    ]);
    expect(store.get("review")!.description).toBe("user review");
  });
});

describe("buildSkillCatalogText", () => {
  it("should return empty string for empty store", () => {
    const store = new SkillStore([]);
    expect(buildSkillCatalogText(store)).toBe("");
  });

  it("should format skills as compact list", () => {
    const store = new SkillStore([
      { name: "commit", description: "Smart commits", instructions: "do it", sourcePath: "/a", source: "user" },
      { name: "review", description: "Code review", instructions: "review it", sourcePath: "/b", source: "project" },
    ]);
    const text = buildSkillCatalogText(store);
    expect(text).toContain('"commit": Smart commits');
    expect(text).toContain('"review": Code review');
  });
});

describe("resolveSlashSkill", () => {
  const store = new SkillStore([
    { name: "commit", description: "Smart commits", instructions: "Commit instructions", sourcePath: "/a", source: "user" },
  ]);

  it("should resolve /skill-name with remaining args", () => {
    const result = resolveSlashSkill("/commit fix the bug", store);
    expect(result).not.toBeNull();
    expect(result!.skill.name).toBe("commit");
    expect(result!.remaining).toBe("fix the bug");
  });

  it("should resolve /skill-name without args", () => {
    const result = resolveSlashSkill("/commit", store);
    expect(result).not.toBeNull();
    expect(result!.skill.name).toBe("commit");
    expect(result!.remaining).toBe("");
  });

  it("should return null for non-slash messages", () => {
    expect(resolveSlashSkill("hello world", store)).toBeNull();
  });

  it("should return null for unknown skill", () => {
    expect(resolveSlashSkill("/unknown-skill args", store)).toBeNull();
  });
});
