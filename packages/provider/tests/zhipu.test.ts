import { describe, expect, it } from "vitest";
import { ZhipuProvider } from "../src/adapters/zhipu.js";
import { hasSubscription } from "../src/provider.js";

describe("ZhipuProvider", () => {
  it("should accept string config (backward compatible)", () => {
    const provider = new ZhipuProvider("test-key");
    expect(provider.id).toBe("zhipu");
    expect(provider.name).toBe("智谱 AI");
  });

  it("should have correct id and name", () => {
    const provider = new ZhipuProvider({ apiKey: "test-key" });
    expect(provider.id).toBe("zhipu");
    expect(provider.name).toBe("智谱 AI");
  });

  it("should default to cn + general endpoint with null subscription", () => {
    const provider = new ZhipuProvider("test-key");
    expect(provider.subscription).toBeNull();
    expect(hasSubscription(provider)).toBe(false);
  });

  it("should list all models", () => {
    const provider = new ZhipuProvider("test-key");
    const models = provider.listModels();
    expect(models.length).toBe(9);
    expect(models.map((m) => m.id)).toContain("glm-5");
    expect(models.map((m) => m.id)).toContain("glm-4.7");
    expect(models.map((m) => m.id)).toContain("glm-4.6v");
  });

  it("should have subscription for coding endpoint", () => {
    const provider = new ZhipuProvider({
      apiKey: "test-key",
      platform: "cn",
      endpoint: "coding",
    });
    expect(provider.id).toBe("zhipu");
    expect(provider.subscription).not.toBeNull();
    expect(hasSubscription(provider)).toBe(true);
  });

  it("should have null subscription for intl + general", () => {
    const provider = new ZhipuProvider({
      apiKey: "test-key",
      platform: "intl",
      endpoint: "general",
    });
    expect(provider.subscription).toBeNull();
  });

  it("should have subscription for intl + coding", () => {
    const provider = new ZhipuProvider({
      apiKey: "test-key",
      platform: "intl",
      endpoint: "coding",
    });
    expect(provider.subscription).not.toBeNull();
  });

  it("should transform request with providerOptions", () => {
    const provider = new ZhipuProvider("test-key");

    const transformed = (
      provider as unknown as {
        transformRequest: (req: unknown) => unknown;
      }
    ).transformRequest({
      model: "glm-5",
      messages: [{ role: "user", content: "Hello" }],
      stream: false,
      providerOptions: {
        thinking: { type: "enabled" },
        do_sample: false,
      },
    });

    const body = transformed as Record<string, unknown>;
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.do_sample).toBe(false);
  });

  it("should not add zhipu-specific fields without providerOptions", () => {
    const provider = new ZhipuProvider("test-key");

    const transformed = (
      provider as unknown as {
        transformRequest: (req: unknown) => unknown;
      }
    ).transformRequest({
      model: "glm-5",
      messages: [{ role: "user", content: "Hello" }],
      stream: false,
    });

    const body = transformed as Record<string, unknown>;
    expect(body.thinking).toBeUndefined();
    expect(body.do_sample).toBeUndefined();
  });
});
