import { describe, expect, it } from "vitest";
import type { Provider } from "../src/provider.js";
import { hasSubscription, resolveProviderId } from "../src/provider.js";
import type { SubscriptionClient } from "../src/usage/subscription.js";

describe("resolveProviderId", () => {
  it("should return explicit default provider", () => {
    const result = resolveProviderId({
      providers: [{ type: "openai-compatible", id: "my-llm" }],
      settings: { defaultProvider: "zhipu" },
    });
    expect(result).toBe("zhipu");
  });

  it("should return zhipu for first zhipu provider", () => {
    const result = resolveProviderId({
      providers: [{ type: "zhipu" }],
      settings: {},
    });
    expect(result).toBe("zhipu");
  });

  it("should return provider id for first openai-compatible provider", () => {
    const result = resolveProviderId({
      providers: [{ type: "openai-compatible", id: "my-llm" }],
      settings: {},
    });
    expect(result).toBe("my-llm");
  });

  it("should return null when no providers configured", () => {
    const result = resolveProviderId({
      providers: [],
      settings: {},
    });
    expect(result).toBeNull();
  });

  it("should prefer first provider when no default set", () => {
    const result = resolveProviderId({
      providers: [
        { type: "openai-compatible", id: "first" },
        { type: "openai-compatible", id: "second" },
      ],
      settings: {},
    });
    expect(result).toBe("first");
  });
});

describe("hasSubscription", () => {
  it("should return false for provider without subscription", () => {
    const provider: Provider = {
      id: "test",
      name: "Test",
      chat: async () => ({}) as never,
      chatStream: async function* () {},
      listModels: () => [],
    };
    expect(hasSubscription(provider)).toBe(false);
  });

  it("should return true for provider with subscription", () => {
    const provider = {
      id: "test",
      name: "Test",
      subscription: {
        getSubscriptionInfo: async () => ({
          planName: "Pro",
          quotas: [],
          expiresAt: null,
          primaryPercentage: 0,
        }),
        getUsage: async () => ({ callCount: 0, totalTokens: 0 }),
      } satisfies SubscriptionClient,
      chat: async () => ({}) as never,
      chatStream: async function* () {},
      listModels: () => [],
    };
    expect(hasSubscription(provider)).toBe(true);
  });

  it("should return false when subscription is null", () => {
    const provider = {
      id: "test",
      name: "Test",
      subscription: null,
      chat: async () => ({}) as never,
      chatStream: async function* () {},
      listModels: () => [],
    };
    expect(hasSubscription(provider)).toBe(false);
  });
});
