import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestConfig, createZhipuProvider, createOpenAIProvider } from "../helper/fixture";

const mockApi = vi.hoisted(() => ({
  getConfig: vi.fn(),
  updateSettings: vi.fn(),
  addProvider: vi.fn(),
  deleteProvider: vi.fn(),
}));

vi.mock("../../src/lib/api-client", () => ({
  api: mockApi,
}));

import { configStore } from "../../src/stores/config";

describe("configStore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset store state by loading empty config
    mockApi.getConfig.mockResolvedValue(createTestConfig());
    await configStore.loadConfig();
  });

  it("should return config after load", () => {
    expect(configStore.config()).not.toBeNull();
    expect(configStore.config()?.providers).toEqual([]);
  });

  describe("loadConfig", () => {
    it("should set config from API", async () => {
      const cfg = createTestConfig({
        providers: [createZhipuProvider()],
        settings: { defaultProvider: "zhipu" },
      });
      mockApi.getConfig.mockResolvedValue(cfg);
      await configStore.loadConfig();
      expect(configStore.config()).toEqual(cfg);
    });

    it("should set loading to false in finally", async () => {
      mockApi.getConfig.mockRejectedValue(new Error("fail"));
      await expect(configStore.loadConfig()).rejects.toThrow("fail");
      expect(configStore.loading()).toBe(false);
    });
  });

  describe("activeProviderId", () => {
    it("should return null when config has no providers", () => {
      expect(configStore.activeProviderId()).toBeNull();
    });

    it("should return null when config has no providers", async () => {
      mockApi.getConfig.mockResolvedValue(createTestConfig());
      await configStore.loadConfig();
      expect(configStore.activeProviderId()).toBeNull();
    });

    it("should return settings.defaultProvider when set", async () => {
      mockApi.getConfig.mockResolvedValue(
        createTestConfig({
          providers: [createZhipuProvider(), createOpenAIProvider()],
          settings: { defaultProvider: "test-provider" },
        }),
      );
      await configStore.loadConfig();
      expect(configStore.activeProviderId()).toBe("test-provider");
    });

    it('should return "zhipu" for zhipu type provider as first', async () => {
      mockApi.getConfig.mockResolvedValue(
        createTestConfig({ providers: [createZhipuProvider()] }),
      );
      await configStore.loadConfig();
      expect(configStore.activeProviderId()).toBe("zhipu");
    });

    it("should return provider id for openai-compatible as first", async () => {
      mockApi.getConfig.mockResolvedValue(
        createTestConfig({ providers: [createOpenAIProvider()] }),
      );
      await configStore.loadConfig();
      expect(configStore.activeProviderId()).toBe("test-provider");
    });

    it("should prefer settings.defaultProvider over first provider", async () => {
      mockApi.getConfig.mockResolvedValue(
        createTestConfig({
          providers: [createZhipuProvider(), createOpenAIProvider()],
          settings: { defaultProvider: "test-provider" },
        }),
      );
      await configStore.loadConfig();
      expect(configStore.activeProviderId()).toBe("test-provider");
    });
  });

  describe("activeModel", () => {
    it("should return null when no providers", () => {
      expect(configStore.activeModel()).toBeNull();
    });

    it("should return settings.defaultModel when set", async () => {
      mockApi.getConfig.mockResolvedValue(
        createTestConfig({
          providers: [createOpenAIProvider()],
          settings: { defaultModel: "custom-model" },
        }),
      );
      await configStore.loadConfig();
      expect(configStore.activeModel()).toBe("custom-model");
    });

    it("should return null when no active provider", async () => {
      mockApi.getConfig.mockResolvedValue(createTestConfig());
      await configStore.loadConfig();
      expect(configStore.activeModel()).toBeNull();
    });

    it("should return first model of active openai-compatible provider", async () => {
      mockApi.getConfig.mockResolvedValue(
        createTestConfig({ providers: [createOpenAIProvider()] }),
      );
      await configStore.loadConfig();
      expect(configStore.activeModel()).toBe("qwen3");
    });

    it("should return null when active provider is zhipu", async () => {
      mockApi.getConfig.mockResolvedValue(
        createTestConfig({ providers: [createZhipuProvider()] }),
      );
      await configStore.loadConfig();
      expect(configStore.activeModel()).toBeNull();
    });
  });

  describe("updateSettings", () => {
    it("should call API and update store when config exists", async () => {
      mockApi.getConfig.mockResolvedValue(createTestConfig());
      await configStore.loadConfig();

      const newSettings = { defaultProvider: "zhipu" };
      mockApi.updateSettings.mockResolvedValue(newSettings);
      await configStore.updateSettings(newSettings);

      expect(mockApi.updateSettings).toHaveBeenCalledWith(newSettings);
      expect(configStore.config()?.settings).toEqual(newSettings);
    });

    it("should not crash when config is null", async () => {
      mockApi.updateSettings.mockResolvedValue({});
      await configStore.updateSettings({});
      expect(mockApi.updateSettings).toHaveBeenCalled();
    });
  });

  describe("addProvider", () => {
    it("should call API and update store when config exists", async () => {
      mockApi.getConfig.mockResolvedValue(createTestConfig());
      await configStore.loadConfig();

      const newProviders = [createZhipuProvider()];
      mockApi.addProvider.mockResolvedValue(newProviders);
      await configStore.addProvider({ type: "zhipu", apiKey: "key" });

      expect(mockApi.addProvider).toHaveBeenCalled();
      expect(configStore.config()?.providers).toEqual(newProviders);
    });
  });

  describe("deleteProvider", () => {
    it("should call API and update store when config exists", async () => {
      const provider = createZhipuProvider();
      mockApi.getConfig.mockResolvedValue(
        createTestConfig({ providers: [provider] }),
      );
      await configStore.loadConfig();

      mockApi.deleteProvider.mockResolvedValue([]);
      await configStore.deleteProvider("zhipu");

      expect(mockApi.deleteProvider).toHaveBeenCalledWith("zhipu");
      expect(configStore.config()?.providers).toEqual([]);
    });
  });
});
