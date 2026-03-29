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
