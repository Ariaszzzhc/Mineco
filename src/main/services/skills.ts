/**
 * Skills service (EDD §8.1, M3).
 *
 * A Skill = a directory with a `SKILL.md` file containing YAML frontmatter
 * (at minimum `name` and `description`). Three scope layers:
 *
 *   - Global:  `~/.mineco/skills/<name>/SKILL.md`
 *   - Project: `<workspaceRoot>/.claude/skills/<name>/SKILL.md`
 *   - Local:   `<workspaceRoot>/.mineco/skills/<name>/SKILL.md`
 *
 * Disabled toggles live in settings files (`disabledSkills[]`), not in the
 * SKILL.md itself.
 *
 * Skills are merged via `scope.ts` (same priority/shadowing rules as MCP).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SkillEntry } from "@/shared/agent-protocol";
import {
  getDisabledSkills,
  globalSettingsPath,
  toggleSkill,
  workspaceSettingsPath,
} from "./app-settings";
import type { Scope } from "./scope";
import { resolveScoped } from "./scope";
import { getWorkspacePaths } from "./workspace-paths";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function globalSkillsDir(): string {
  return path.join(os.homedir(), ".mineco", "skills");
}

function projectSkillsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".claude", "skills");
}

function localSkillsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".mineco", "skills");
}

// ---------------------------------------------------------------------------
// YAML frontmatter parser (minimal — no external dep)
// ---------------------------------------------------------------------------

interface FrontMatter {
  name?: string;
  description?: string;
}

/**
 * Extracts YAML frontmatter from a markdown string delimited by `---` fences.
 * Only parses simple `key: value` scalar pairs — nested YAML is ignored.
 */
function parseFrontMatter(content: string): FrontMatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const block = match[1];
  const result: FrontMatter = {};
  for (const line of block.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key === "name") result.name = value;
    if (key === "description") result.description = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Directory scanner
// ---------------------------------------------------------------------------

/**
 * Scans a skills directory, reads each `<name>/SKILL.md`, and returns entries
 * for the given scope. Missing / unreadable skills are silently skipped.
 */
async function scanSkillsDir(dir: string, scope: Scope): Promise<SkillEntry[]> {
  let names: string[] = [];
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    names = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }

  const entries: SkillEntry[] = [];
  for (const name of names) {
    const skillDir = path.join(dir, name);
    const mdPath = path.join(skillDir, "SKILL.md");
    try {
      const content = await fs.readFile(mdPath, "utf8");
      const fm = parseFrontMatter(content);
      entries.push({
        name: fm.name ?? name,
        description: fm.description ?? "",
        scope,
        path: skillDir,
        enabled: true, // set correctly by resolveScoped
      });
    } catch {
      // Skip unreadable skills.
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the merged, scoped skill list for a workspace (or global-only when
 * `workspaceId` is null).
 *
 * Disabled skills and shadowed lower-priority skills are marked accordingly.
 */
export async function listSkills(
  workspaceId: string | null,
): Promise<SkillEntry[]> {
  const { rootPath } = workspaceId
    ? await getWorkspacePaths(workspaceId)
    : { rootPath: null };

  const globalEntries = await scanSkillsDir(globalSkillsDir(), "global");
  const globalDisabled = await getDisabledSkills(globalSettingsPath());

  let projectEntries: SkillEntry[] = [];
  let localEntries: SkillEntry[] = [];
  let workspaceDisabled: Set<string> = new Set();

  if (rootPath) {
    projectEntries = await scanSkillsDir(projectSkillsDir(rootPath), "project");
    localEntries = await scanSkillsDir(localSkillsDir(rootPath), "local");
    workspaceDisabled = await getDisabledSkills(
      workspaceSettingsPath(rootPath),
    );
  }

  const disabled = new Set([...globalDisabled, ...workspaceDisabled]);
  return resolveScoped(globalEntries, projectEntries, localEntries, disabled);
}

/**
 * Toggles the enabled state of a named skill, writing the toggle into the
 * appropriate settings file.
 */
export async function toggleSkillEnabled(
  name: string,
  enabled: boolean,
  workspaceId: string | null,
): Promise<void> {
  if (!workspaceId) {
    await toggleSkill(globalSettingsPath(), name, enabled);
    return;
  }
  const { rootPath } = await getWorkspacePaths(workspaceId);
  const settingsFile = rootPath
    ? workspaceSettingsPath(rootPath)
    : globalSettingsPath();
  await toggleSkill(settingsFile, name, enabled);
}

/** Minimal SKILL.md template for scaffolded skills. */
const SKILL_MD_TEMPLATE = (name: string) => `---
name: ${name}
description: Describe what this skill does.
---

# ${name}

Add instructions for this skill here.
`;

/**
 * Scaffolds a new skill directory + minimal `SKILL.md`.
 *
 * - `scope === "global"` → `~/.mineco/skills/<name>/SKILL.md`
 * - `scope === "project"` → `<workspaceRoot>/.claude/skills/<name>/SKILL.md`
 * - `scope === "local"` → `<workspaceRoot>/.mineco/skills/<name>/SKILL.md`
 *
 * Returns the created `SkillEntry`.
 */
export async function createSkill(
  name: string,
  scope: Scope,
  workspaceId: string | null,
): Promise<SkillEntry> {
  let baseDir: string;
  if (scope === "global") {
    baseDir = globalSkillsDir();
  } else {
    const { rootPath } = workspaceId
      ? await getWorkspacePaths(workspaceId)
      : { rootPath: null };
    if (!rootPath)
      throw new Error(
        "A workspace root path is required for project/local scope.",
      );
    baseDir =
      scope === "local" ? localSkillsDir(rootPath) : projectSkillsDir(rootPath);
  }

  const skillDir = path.join(baseDir, name);
  const mdPath = path.join(skillDir, "SKILL.md");
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(mdPath, SKILL_MD_TEMPLATE(name), "utf8");

  return {
    name,
    description: "Describe what this skill does.",
    scope,
    path: skillDir,
    enabled: true,
  };
}
