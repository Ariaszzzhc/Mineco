import { z } from "zod";

export const SkillFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      "Must be lowercase alphanumeric with hyphens, no leading/trailing hyphens, no consecutive hyphens",
    ),
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  "allowed-tools": z.string().optional(),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

export interface SkillManifest {
  name: string;
  description: string;
  instructions: string;
  sourcePath: string;
  source: "project" | "user";
}
