import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "../src/registry";
import { ZhipuProvider } from "../src/adapters/zhipu";
import type { UserProviderConfig } from "../src/types";

describe("ProviderRegistry", () => {
  it("should register a provider", () => {
    const registry = new ProviderRegistry();
    const zhipu = new ZhipuProvider("test-key");
    registry.register(zhipu);

    expect(registry.get("zhipu")).toBe(zhipu);
  });

  it("should throw for unknown provider", () => {
    const registry = new ProviderRegistry();
    expect(() => registry.get("unknown")).toThrow('Provider "unknown" not found');
  });

  it("should list registered providers", () => {
    const registry = new ProviderRegistry();
    registry.register(new ZhipuProvider("test-key"));

    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("zhipu");
    expect(list[0]?.name).toBe("智谱 AI");
    expect(list[0]?.models.length).toBeGreaterThan(0);
  });

  it("should register user-defined provider from config", () => {
    const registry = new ProviderRegistry();
    const config: UserProviderConfig = {
      id: "my-ollama",
      type: "openai-compatible",
      baseURL: "http://localhost:11434/v1",
      models: [
        { id: "qwen2.5-coder:7b", name: "Qwen2.5 Coder 7B" },
        {
          id: "deepseek-r1:8b",
          name: "DeepSeek R1 8B",
          supportsVision: true,
          maxOutputTokens: 8192,
          pricing: { inputPerMillion: 0, outputPerMillion: 0 },
        },
      ],
    };

    registry.registerFromConfig(config);

    const provider = registry.get("my-ollama");
    expect(provider.id).toBe("my-ollama");
    expect(provider.listModels()).toHaveLength(2);

    const models = provider.listModels();
    expect(models[0]?.id).toBe("qwen2.5-coder:7b");
    expect(models[0]?.maxOutputTokens).toBe(4096); // default
    expect(models[1]?.supportsVision).toBe(true);
    expect(models[1]?.maxOutputTokens).toBe(8192);
    expect(models[1]?.pricing).toEqual({ inputPerMillion: 0, outputPerMillion: 0 });
  });

  it("should have a usage tracker", () => {
    const registry = new ProviderRegistry();
    expect(registry.usage).toBeDefined();

    registry.usage.record("zhipu", "glm-5", {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });

    const stats = registry.usage.getStats();
    expect(stats.totalTokens).toBe(150);
  });
});
