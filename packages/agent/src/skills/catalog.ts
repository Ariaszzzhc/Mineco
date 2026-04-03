import type { SkillStore } from "./store.js";

export function buildSkillCatalogText(store: SkillStore): string {
  const skills = store.getAll();
  if (skills.length === 0) return "";
  return skills.map((s) => `- "${s.name}": ${s.description}`).join("\n");
}

export function injectSkillCatalog(
  systemPrompt: string,
  catalogText: string,
): string {
  if (!catalogText) return systemPrompt;

  const block = `<skills>
The following skills provide specialized instructions for specific tasks.
When a task matches a skill's description, call the activate_skill tool with the skill's name to load its full instructions.

${catalogText}
</skills>`;

  if (systemPrompt.includes("</env>")) {
    return systemPrompt.replace("</env>", `</env>\n${block}`);
  }
  return systemPrompt + block;
}
