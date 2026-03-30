import { describe, expect, it, beforeEach, vi } from "vitest";
import { createConfigRoutes } from "../../src/routes/config.js";
import { createMockConfigService } from "../helper/mock-config-service.js";
import type { AppConfig } from "../../src/config/schema.js";

function jsonHeaders(): Headers {
  return new Headers({ "Content-Type": "application/json" });
}

describe("Config Routes", () => {
  let configService: ReturnType<typeof createMockConfigService>;
  let app: ReturnType<typeof createConfigRoutes>;

  beforeEach(() => {
    configService = createMockConfigService();
    app = createConfigRoutes(configService);
    vi.clearAllMocks();
  });

  describe("GET /", () => {
    it("should return masked config wrapped in data", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(body.data.providers).toEqual([]);
      expect(body.data.settings).toEqual({});
    });
  });

  describe("PUT /", () => {
    it("should replace config and return masked version", async () => {
      const newConfig: AppConfig = {
        providers: [{ type: "zhipu", apiKey: "new-key", platform: "cn", endpoint: "general" }],
        settings: { defaultProvider: "zhipu" },
      };
      const res = await app.request("/", {
        method: "PUT",
        body: JSON.stringify(newConfig),
        headers: jsonHeaders(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.settings.defaultProvider).toBe("zhipu");
      expect(configService.updateConfig).toHaveBeenCalledWith(newConfig);
    });
  });

  describe("GET /providers", () => {
    it("should return masked providers", async () => {
      const res = await app.request("/providers");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toBeDefined();
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
      expect(body.data).toBeDefined();
    });
  });

  describe("DELETE /providers/:id", () => {
    it("should remove provider and return 200", async () => {
      // Setup: config has a zhipu provider (id = "zhipu")
      configService = createMockConfigService({
        providers: [{ type: "zhipu", apiKey: "test-key", platform: "cn", endpoint: "general" }],
        settings: {},
      });
      app = createConfigRoutes(configService);

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
      expect(body.data).toBeDefined();
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
      expect(body.data).toBeDefined();
      expect(configService.updateConfig).toHaveBeenCalled();
    });
  });
});
