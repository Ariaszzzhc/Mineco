import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { AppConfig } from "../../src/config/schema.js";
import { createConfigRoutes } from "../../src/routes/config.js";
import { createMockConfigService } from "../helper/mock-config-service.js";

function jsonHeaders(): Headers {
  return new Headers({ "Content-Type": "application/json" });
}

describe("Config Routes", () => {
  let configService: ReturnType<typeof createMockConfigService>;
  let app: ReturnType<typeof createConfigRoutes>;
  const mockRegistryModels = () => [
    { id: "zhipu", name: "Zhipu", models: [{ id: "glm-5", name: "GLM-5", contextWindow: 131072 }] },
  ];

  const mockRegistry = {
    get: vi.fn().mockReturnValue(null),
  } as unknown as Parameters<typeof createConfigRoutes>[2];

  beforeEach(() => {
    configService = createMockConfigService();
    app = createConfigRoutes(configService, mockRegistryModels, mockRegistry);
    vi.clearAllMocks();
  });

  describe("GET /", () => {
    it("should return masked config", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.providers).toEqual([]);
      expect(body.settings).toEqual({});
    });
  });

  describe("PUT /", () => {
    it("should replace config and return masked version", async () => {
      const newConfig: AppConfig = {
        providers: [
          {
            type: "zhipu",
            apiKey: "new-key",
            platform: "cn",
            endpoint: "general",
          },
        ],
        settings: { defaultProvider: "zhipu" },
      };
      const res = await app.request("/", {
        method: "PUT",
        body: JSON.stringify(newConfig),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.settings.defaultProvider).toBe("zhipu");
      expect(configService.updateConfig).toHaveBeenCalledWith(newConfig);
    });
  });

  describe("GET /providers", () => {
    it("should return masked providers", async () => {
      const res = await app.request("/providers");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("GET /providers/models", () => {
    it("should return registry provider models", async () => {
      const res = await app.request("/providers/models");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("POST /providers", () => {
    it("should add a provider and return 201", async () => {
      const provider = {
        type: "zhipu",
        apiKey: "test-key",
      };
      const res = await app.request("/providers", {
        method: "POST",
        body: JSON.stringify(provider),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe("DELETE /providers/:id", () => {
    it("should remove provider and return 200", async () => {
      // Setup: config has a zhipu provider (id = "zhipu")
      configService = createMockConfigService({
        providers: [
          {
            type: "zhipu",
            apiKey: "test-key",
            platform: "cn",
            endpoint: "general",
          },
        ],
        settings: {},
      });
      app = createConfigRoutes(configService, mockRegistryModels, mockRegistry);

      const res = await app.request("/providers/zhipu", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
    });

    it("should return 404 when provider not found", async () => {
      const res = await app.request("/providers/non-existent", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("non-existent");
    });
  });

  describe("GET /settings", () => {
    it("should return current settings", async () => {
      const res = await app.request("/settings");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeDefined();
    });
  });

  describe("PATCH /settings", () => {
    it("should merge settings and return updated", async () => {
      const res = await app.request("/settings", {
        method: "PATCH",
        body: JSON.stringify({ defaultProvider: "zhipu" }),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeDefined();
      expect(configService.updateConfig).toHaveBeenCalled();
    });

    it("should return 400 for invalid settings", async () => {
      configService.updateConfig = vi.fn(async () => {
        throw new ZodError([
          {
            code: "invalid_type",
            expected: "string",
            input: 1,
            path: ["defaultProvider"],
            message: "Expected string",
          },
        ]);
      });

      const res = await app.request("/settings", {
        method: "PATCH",
        body: JSON.stringify({ defaultProvider: 123 }),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeDefined();
      expect(body.details).toHaveLength(1);
    });
  });

  describe("GET /subscription", () => {
    it("should return null subscription when no provider configured", async () => {
      const res = await app.request("/subscription");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ subscription: null });
    });

    it("should return null subscription when provider has no subscription support", async () => {
      configService = createMockConfigService({
        providers: [{ type: "zhipu", apiKey: "test-key", platform: "cn", endpoint: "general" }],
        settings: { defaultProvider: "zhipu" },
      });
      // mockRegistry.get returns null by default (no subscription)
      app = createConfigRoutes(configService, mockRegistryModels, mockRegistry);

      const res = await app.request("/subscription");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ subscription: null });
    });

    it("should return subscription info when provider supports it", async () => {
      configService = createMockConfigService({
        providers: [{ type: "zhipu", apiKey: "test-key", platform: "cn", endpoint: "general" }],
        settings: { defaultProvider: "zhipu" },
      });

      const mockSubscriptionInfo = {
        planName: "Pro",
        quotas: [{ label: "Token", used: 100, limit: 1000, percentage: 10, window: "5h", resetAt: null }],
        expiresAt: null,
      };

      const providerMock = {
        id: "zhipu",
        subscription: { getSubscriptionInfo: async () => mockSubscriptionInfo },
      };
      const registryMock = {
        get: vi.fn().mockReturnValue(providerMock),
      } as unknown as Parameters<typeof createConfigRoutes>[2];

      app = createConfigRoutes(configService, mockRegistryModels, registryMock);

      const res = await app.request("/subscription");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.subscription).toEqual(mockSubscriptionInfo);
    });

    it("should return null subscription when subscription fetch throws", async () => {
      configService = createMockConfigService({
        providers: [{ type: "zhipu", apiKey: "test-key", platform: "cn", endpoint: "general" }],
        settings: { defaultProvider: "zhipu" },
      });

      const providerMock = {
        id: "zhipu",
        subscription: { getSubscriptionInfo: async () => { throw new Error("API error"); } },
      };
      const registryMock = {
        get: vi.fn().mockReturnValue(providerMock),
      } as unknown as Parameters<typeof createConfigRoutes>[2];

      app = createConfigRoutes(configService, mockRegistryModels, registryMock);

      const res = await app.request("/subscription");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ subscription: null });
    });
  });

  describe("error handling", () => {
    it("should return 400 when PUT / fails Zod validation", async () => {
      configService.updateConfig = vi.fn(async () => {
        throw new ZodError([
          {
            code: "invalid_type",
            expected: "string",
            input: undefined,
            path: ["providers"],
            message: "Required",
          },
        ]);
      });

      const res = await app.request("/", {
        method: "PUT",
        body: JSON.stringify({ providers: "invalid" }),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeDefined();
    });

    it("should return 400 when POST /providers fails Zod validation", async () => {
      configService.updateConfig = vi.fn(async () => {
        throw new ZodError([
          {
            code: "invalid_type",
            expected: "string",
            input: undefined,
            path: ["type"],
            message: "Required",
          },
        ]);
      });

      const res = await app.request("/providers", {
        method: "POST",
        body: JSON.stringify({ invalid: "provider" }),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(body.details).toBeDefined();
    });

    it("should delete openai-compatible provider by id", async () => {
      configService = createMockConfigService({
        providers: [
          {
            type: "openai-compatible",
            id: "ollama",
            baseURL: "http://localhost:11434/v1",
            models: [{ id: "qwen3", name: "Qwen3" }],
          },
        ],
        settings: {},
      });
      app = createConfigRoutes(configService, mockRegistryModels, mockRegistry);

      const res = await app.request("/providers/ollama", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      expect(configService.updateConfig).toHaveBeenCalled();
    });

    it("should re-throw non-ZodError from PUT /", async () => {
      configService.updateConfig = vi.fn(async () => {
        throw new Error("database error");
      });

      const res = await app.request("/", {
        method: "PUT",
        body: JSON.stringify({ providers: [], settings: {} }),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(500);
    });

    it("should re-throw non-ZodError from POST /providers", async () => {
      configService.updateConfig = vi.fn(async () => {
        throw new Error("database error");
      });

      const res = await app.request("/providers", {
        method: "POST",
        body: JSON.stringify({ type: "zhipu", apiKey: "key" }),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(500);
    });

    it("should re-throw non-ZodError from PATCH /settings", async () => {
      configService.updateConfig = vi.fn(async () => {
        throw new Error("database error");
      });

      const res = await app.request("/settings", {
        method: "PATCH",
        body: JSON.stringify({ defaultProvider: "zhipu" }),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(500);
    });
  });
});
