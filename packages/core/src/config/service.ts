import { ZhipuProvider } from "@mineco/provider";
import type { ProviderRegistry } from "@mineco/provider";
import { loadConfig, saveConfig } from "./loader.js";
import { maskApiKey } from "./mask.js";
import { configSchema } from "./schema.js";
import type {
  AppConfig,
  OpenAICompatProviderConfig,
  ProviderConfig,
} from "./schema.js";

export class ConfigService {
  private config: AppConfig;
  private readonly registry: ProviderRegistry;

  constructor(registry: ProviderRegistry, config?: AppConfig) {
    this.registry = registry;
    this.config = config ?? configSchema.parse({});
  }

  async initialize(): Promise<void> {
    this.config = await loadConfig();
    this.registerProviders();
  }

  getMaskedConfig(): AppConfig {
    return {
      ...this.config,
      providers: this.config.providers.map(maskProvider),
    };
  }

  getConfig(): Readonly<AppConfig> {
    return this.config;
  }

  async updateConfig(raw: unknown): Promise<AppConfig> {
    const validated = configSchema.parse(raw);
    this.config = validated;
    await saveConfig(validated);
    this.registerProviders();
    return this.getMaskedConfig();
  }

  private registerProviders(): void {
    this.registry.clear();
    for (const providerConfig of this.config.providers) {
      this.registerProvider(providerConfig);
    }
  }

  private registerProvider(config: ProviderConfig): void {
    switch (config.type) {
      case "zhipu": {
        const provider = new ZhipuProvider({
          apiKey: config.apiKey,
          platform: config.platform,
          endpoint: config.endpoint,
        });
        this.registry.register(provider);
        break;
      }
      case "openai-compatible": {
        const mapped: OpenAICompatProviderConfig = config;
        this.registry.registerFromConfig({
          id: mapped.id,
          type: "openai-compatible",
          baseURL: mapped.baseURL,
          ...(mapped.apiKey !== undefined && { apiKey: mapped.apiKey }),
          ...(mapped.headers !== undefined && { headers: mapped.headers }),
          models: mapped.models,
        });
        break;
      }
    }
  }
}

function maskProvider(config: ProviderConfig): ProviderConfig {
  switch (config.type) {
    case "zhipu":
      return { ...config, apiKey: maskApiKey(config.apiKey) };
    case "openai-compatible":
      return { ...config, apiKey: maskApiKey(config.apiKey) };
  }
}
