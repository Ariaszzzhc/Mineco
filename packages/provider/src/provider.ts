import type {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ModelInfo,
} from "./types.js";
import type { SubscriptionClient } from "./usage/subscription.js";

export interface Provider {
  readonly id: string;
  readonly name: string;

  chat(req: ChatRequest): Promise<ChatResponse>;
  chatStream(req: ChatRequest): AsyncGenerator<ChatStreamChunk>;
  listModels(): ModelInfo[];
}

/** Check if a provider supports subscription/usage querying */
export function hasSubscription(
  provider: Provider,
): provider is Provider & { subscription: SubscriptionClient } {
  return (
    "subscription" in provider &&
    (provider as Record<string, unknown>).subscription !== null
  );
}

export interface ProviderListEntry {
  type: string;
  id?: string;
}

export interface ProviderResolvableConfig {
  providers: ProviderListEntry[];
  settings: { defaultProvider?: string | undefined };
}

/** Resolve the active provider ID from config: explicit default → first provider → null */
export function resolveProviderId(
  config: ProviderResolvableConfig,
): string | null {
  const { defaultProvider } = config.settings;
  if (defaultProvider) return defaultProvider;
  const first = config.providers[0];
  if (!first) return null;
  return first.type === "zhipu" ? "zhipu" : first.type === "minimax" ? "minimax" : (first.id ?? null);
}
