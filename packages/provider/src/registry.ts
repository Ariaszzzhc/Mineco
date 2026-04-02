import { OpenAICompatAdapter } from "./adapters/openai-compat.js";
import type { Provider as IProvider } from "./provider.js";
import { type RateLimitConfig, TokenBucketRateLimiter } from "./rate-limit.js";
import type { Usage, UsageRecorder, UserProviderConfig } from "./types.js";
import { UsageTracker } from "./usage/tracker.js";

export interface ProviderMeta {
  id: string;
  name: string;
  models: Array<{ id: string; name: string; contextWindow?: number }>;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, IProvider>();
  readonly usage = new UsageTracker();
  private rateLimiter?: TokenBucketRateLimiter;
  private recorder?: UsageRecorder;

  setRecorder(recorder: UsageRecorder): void {
    this.recorder = recorder;
  }

  recordUsage(
    providerId: string,
    model: string,
    usage: Usage,
    sessionId?: string,
  ): void {
    this.usage.record(providerId, model, usage);
    this.recorder?.record(providerId, model, usage, sessionId);
  }

  register(provider: IProvider): void {
    this.providers.set(provider.id, provider);
  }

  registerFromConfig(config: UserProviderConfig): void {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...config.headers,
    };

    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const provider = new OpenAICompatAdapter({
      id: config.id,
      name: config.id,
      baseURL: config.baseURL,
      headers,
      models: config.models.map((m) => ({
        id: m.id,
        name: m.name,
        maxOutputTokens: m.maxOutputTokens ?? 4096,
        ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
        supportsVision: m.supportsVision ?? false,
        supportsToolCalling: m.supportsToolCalling ?? true,
        supportsStreaming: true,
        ...(m.pricing ? { pricing: m.pricing } : {}),
      })),
    });

    this.providers.set(config.id, provider);
  }

  clear(): void {
    this.providers.clear();
  }

  get(id: string): IProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Provider "${id}" not found`);
    }
    return provider;
  }

  list(): ProviderMeta[] {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      models: p.listModels().map((m) => {
        const base = { id: m.id, name: m.name };
        return m.contextWindow
          ? { ...base, contextWindow: m.contextWindow }
          : base;
      }),
    }));
  }

  setRateLimit(config: RateLimitConfig): void {
    this.rateLimiter?.destroy();
    this.rateLimiter = new TokenBucketRateLimiter(config);
  }

  async acquireRateLimit(): Promise<void> {
    await this.rateLimiter?.acquire();
  }
}
