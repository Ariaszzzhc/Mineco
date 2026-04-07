import { z } from "zod";

// --- Provider schemas ---

export const zhipuProviderSchema = z.object({
  type: z.literal("zhipu"),
  apiKey: z.string().min(1),
  platform: z.enum(["cn", "intl"]).default("cn"),
  endpoint: z.enum(["general", "coding"]).default("general"),
});

export const minimaxProviderSchema = z.object({
  type: z.literal("minimax"),
  apiKey: z.string().min(1),
  platform: z.enum(["cn", "intl"]).default("intl"),
});

export const modelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const openaiCompatProviderSchema = z.object({
  type: z.literal("openai-compatible"),
  id: z.string().min(1),
  baseURL: z.string().url(),
  apiKey: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  models: z.array(modelSchema).min(1),
});

export const providerSchema = z.discriminatedUnion("type", [
  zhipuProviderSchema,
  minimaxProviderSchema,
  openaiCompatProviderSchema,
]);

// --- Settings schema ---

export const settingsSchema = z.object({
  defaultProvider: z.string().optional(),
  defaultModel: z.string().optional(),
});

// --- Request body schemas ---

export const createWorkspaceSchema = z.object({
  path: z.string().min(1),
});

export const createSessionSchema = z.object({
  workspaceId: z.string().min(1),
  mode: z.enum(["regular", "worktree"]).optional().default("regular"),
  branchName: z
    .string()
    .regex(/^[\w./-]+$/, "Invalid branch name")
    .optional(),
});

export const updateSessionSchema = z.object({
  title: z.string().min(1).max(100),
});

export const chatRequestSchema = z.object({
  message: z.string().min(1),
  providerId: z.string().min(1),
  model: z.string().min(1),
});

export const updateSettingsSchema = settingsSchema.partial();

export const browseFsSchema = z.object({
  path: z.string().optional(),
});

// --- Root schema ---

export const configSchema = z.object({
  providers: z.array(providerSchema).default([]),
  settings: settingsSchema.default({}),
});

// --- Inferred types ---

export type ZhipuProviderConfig = z.infer<typeof zhipuProviderSchema>;
export type MiniMaxProviderConfig = z.infer<typeof minimaxProviderSchema>;
export type OpenAICompatProviderConfig = z.infer<
  typeof openaiCompatProviderSchema
>;
export type ProviderConfig = z.infer<typeof providerSchema>;
export type AppSettings = z.infer<typeof settingsSchema>;
export type AppConfig = z.infer<typeof configSchema>;
