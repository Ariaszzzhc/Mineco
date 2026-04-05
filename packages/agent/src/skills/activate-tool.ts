import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { defineTool } from "../tools/define.js";
import type { ToolDefinition } from "../tools/types.js";
import type { SkillStore } from "./store.js";
import type { SkillManifest } from "./types.js";

const ActivateSkillSchema = z.object({
  name: z.string().describe("The name of the skill to activate"),
});

export function createActivateSkillTool(
  resolver: (workingDir: string) => SkillStore | undefined,
): ToolDefinition {
  return defineTool({
    name: "activate_skill",
    description:
      "Activate a skill by name to load its detailed instructions into context. " +
      "Use this tool when the user's request matches one of the skills listed in the <skills> section of your system prompt.",
    parameters: ActivateSkillSchema,
    isConcurrencySafe: () => true,
    execute: async (params, ctx) => {
      const store = resolver(ctx.workingDir);
      if (!store) {
        return {
          output: "No skills available for this workspace.",
          isError: true,
        };
      }

      const skill = store.get(params.name);
      if (!skill) {
        const available = store
          .getAll()
          .map((s) => s.name)
          .join(", ");
        return {
          output: `Skill "${params.name}" not found. Available skills: ${available || "(none)"}`,
          isError: true,
        };
      }

      if (store.isActivated(params.name)) {
        return {
          output: `Skill "${params.name}" is already active in this session.`,
        };
      }
      store.markActivated(params.name);

      const resources = await listResources(skill.sourcePath);
      return {
        output: formatSkillOutput(skill, resources),
      };
    },
  });
}

async function listResources(
  skillPath: string,
): Promise<{ dir: string; files: string[] } | null> {
  const skillDir = dirname(skillPath);
  const files: string[] = [];

  const resourceDirs = ["scripts", "references", "assets"];
  for (const sub of resourceDirs) {
    const subDir = join(skillDir, sub);
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(subDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile()) {
        files.push(`${sub}/${entry.name}`);
      }
    }
  }

  return files.length > 0 ? { dir: skillDir, files } : null;
}

function formatSkillOutput(
  skill: SkillManifest,
  resources: { dir: string; files: string[] } | null,
): string {
  const parts: string[] = [];
  parts.push(`# Skill: ${skill.name}`);
  parts.push("");
  parts.push(skill.instructions);

  if (resources) {
    parts.push("");
    parts.push(`Skill directory: ${resources.dir}`);
    parts.push(
      "Relative paths in this skill are relative to the skill directory.",
    );
    parts.push(...resources.files);
  }

  return `<skill-content data-name="${skill.name}">\n${parts.join("\n")}\n</skill-content>`;
}
