import { z } from "zod";
import { defineTool } from "../tools/define.js";
import type { SkillManifest } from "./types.js";
import type { SkillStore } from "./store.js";
import type { ToolDefinition } from "../tools/types.js";

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
        const available = store.getAll().map((s) => s.name).join(", ");
        return {
          output: `Skill "${params.name}" not found. Available skills: ${available || "(none)"}`,
          isError: true,
        };
      }

      return {
        output: formatSkillOutput(skill),
      };
    },
  });
}

function formatSkillOutput(skill: SkillManifest): string {
  const parts: string[] = [];
  parts.push(`# Skill: ${skill.name}`);
  parts.push("");
  parts.push(skill.instructions);
  return `<skill-content data-name="${skill.name}">\n${parts.join("\n")}\n</skill-content>`;
}
