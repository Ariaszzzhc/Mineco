export {
  configSchema,
  zhipuProviderSchema,
  openaiCompatProviderSchema,
  settingsSchema,
  providerSchema,
} from "./schema.js";
export type {
  AppConfig,
  AppSettings,
  ProviderConfig,
  ZhipuProviderConfig,
  OpenAICompatProviderConfig,
} from "./schema.js";
export { loadConfig, saveConfig, createDefaultConfig, getConfigPath } from "./loader.js";
export { ConfigService } from "./service.js";
export { maskApiKey } from "./mask.js";
