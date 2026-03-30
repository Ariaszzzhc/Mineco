import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConfigService } from "../../src/config/service.js";
import type { AppConfig } from "../../src/config/schema.js";
import { createMockProviderRegistry } from "../helper/mock-provider-registry.js";

// Mock loader to avoid filesystem writes
vi.mock("../../src/config/loader.js", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  createDefaultConfig: vi.fn(),
  getConfigPath: vi.fn(() => "/tmp/test/config.json"),
}));

describe("ConfigService", () => {
  let registry: ReturnType<typeof createMockProviderRegistry>;

  beforeEach(() => {
    registry = createMockProviderRegistry();
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should use default config when no config provided", () => {
      const service = new ConfigService(registry);
      expect(service.getConfig()).toEqual({ providers: [], settings: {} });
    });

    it("should use provided config", () => {
      const config: AppConfig = {
        providers: [
          { type: "zhipu", apiKey: "test-key", platform: "cn", endpoint: "general" },
        ],
        settings: { defaultProvider: "zhipu" },
      };
      const service = new ConfigService(registry, config);
      expect(service.getConfig().settings.defaultProvider).toBe("zhipu");
    });
  });

  describe("getMaskedConfig()", () => {
    it("should mask API keys in zhipu providers", () => {
      const config: AppConfig = {
        providers: [{ type: "zhipu", apiKey: "sk-proj-abcdef123456", platform: "cn", endpoint: "general" }],
        settings: {},
      };
      const service = new ConfigService(registry, config);
      const masked = service.getMaskedConfig();
      const provider = masked.providers[0];
      if (provider?.type === "zhipu") {
        expect(provider.apiKey).toBe("sk-p...3456");
      }
    });

    it("should not mutate the original config", () => {
      const config: AppConfig = {
        providers: [{ type: "zhipu", apiKey: "test-key", platform: "cn", endpoint: "general" }],
        settings: {},
      };
      const service = new ConfigService(registry, config);
      service.getMaskedConfig();
      expect(service.getConfig().providers[0]!.type === "zhipu" && service.getConfig().providers[0]!.apiKey).toBe(
        "test-key",
      );
    });
  });

  describe("getConfig()", () => {
    it("should return raw (unmasked) config", () => {
      const config: AppConfig = {
        providers: [{ type: "zhipu", apiKey: "raw-api-key", platform: "cn", endpoint: "general" }],
        settings: {},
      };
      const service = new ConfigService(registry, config);
      const raw = service.getConfig();
      const provider = raw.providers[0];
      if (provider?.type === "zhipu") {
        expect(provider.apiKey).toBe("raw-api-key");
      }
    });
  });

  describe("updateConfig()", () => {
    it("should validate, save and return masked config", async () => {
      const service = new ConfigService(registry);
      const updated = await service.updateConfig({
        providers: [{ type: "zhipu", apiKey: "new-key", platform: "cn", endpoint: "general" }],
        settings: { defaultProvider: "zhipu" },
      });

      expect(updated.settings.defaultProvider).toBe("zhipu");
      // saveConfig should have been called
      const { saveConfig } = await import("../../src/config/loader.js");
      expect(saveConfig).toHaveBeenCalled();
    });

    it("should throw ZodError for invalid config", async () => {
      const service = new ConfigService(registry);
      await expect(
        service.updateConfig({ providers: [{ type: "unknown" as const }] }),
      ).rejects.toThrow();
    });

    it("should call registry.clear() then register for each provider", async () => {
      const service = new ConfigService(registry);
      await service.updateConfig({
        providers: [
          { type: "zhipu", apiKey: "key1", platform: "cn", endpoint: "general" },
          {
            type: "openai-compatible",
            id: "ollama",
            baseURL: "http://localhost:11434/v1",
            models: [{ id: "qwen3", name: "Qwen3" }],
          },
        ],
        settings: {},
      });

      expect(registry.clear).toHaveBeenCalled();
      expect(registry.register).toHaveBeenCalledTimes(1);
      expect(registry.registerFromConfig).toHaveBeenCalledTimes(1);
    });
  });
});
