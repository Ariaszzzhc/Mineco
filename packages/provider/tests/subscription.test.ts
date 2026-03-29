import { describe, expect, it } from "vitest";
import { ZhipuProvider } from "../src/adapters/zhipu.js";
import type { Provider } from "../src/provider.js";
import { hasSubscription } from "../src/provider.js";
import { OpenAICompatAdapter } from "../src/adapters/openai-compat.js";

describe("hasSubscription", () => {
  it("should return true for provider with subscription", () => {
    const provider = new ZhipuProvider({
      apiKey: "test-key",
      endpoint: "coding",
    });
    expect(hasSubscription(provider)).toBe(true);
  });

  it("should return false for provider without subscription", () => {
    const provider = new ZhipuProvider("test-key");
    expect(hasSubscription(provider)).toBe(false);
  });

  it("should return false for provider without subscription property", () => {
    const provider = new OpenAICompatAdapter({
      id: "test",
      name: "Test",
      baseURL: "https://api.test.com/v1",
      models: [],
    });
    expect(hasSubscription(provider)).toBe(false);
  });

  it("should narrow type correctly", () => {
    const provider: Provider = new ZhipuProvider({
      apiKey: "test-key",
      endpoint: "coding",
    });

    if (hasSubscription(provider)) {
      // TypeScript should allow accessing subscription
      expect(typeof provider.subscription.getSubscriptionInfo).toBe("function");
      expect(typeof provider.subscription.getUsage).toBe("function");
    }
  });
});
