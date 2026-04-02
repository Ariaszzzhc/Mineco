import type { ProviderRegistry } from "@mineco/provider";
import { hasSubscription } from "@mineco/provider";
import { Hono } from "hono";
import { ZodError } from "zod";
import type { ProviderConfig } from "../config/schema.js";
import type { ConfigService } from "../config/service.js";

export function createConfigRoutes(
  configService: ConfigService,
  getRegistryModels: () => Array<{
    id: string;
    name: string;
    models: Array<{ id: string; name: string; contextWindow: number }>;
  }>,
  registry: ProviderRegistry,
) {
  return (
    new Hono()
      // GET / — full config (masked)
      .get("/", (c) => {
        return c.json(configService.getMaskedConfig());
      })

      // PUT / — replace full config
      .put("/", async (c) => {
        try {
          const body = await c.req.json();
          const updated = await configService.updateConfig(body);
          return c.json(updated);
        } catch (error: unknown) {
          if (error instanceof ZodError) {
            return c.json(
              { error: "Validation failed", details: error.issues },
              400,
            );
          }
          throw error;
        }
      })

      // GET /providers — list providers (masked)
      .get("/providers", (c) => {
        const config = configService.getMaskedConfig();
        return c.json(config.providers);
      })

      // GET /providers/models — list providers with available models from registry
      .get("/providers/models", (c) => {
        return c.json(getRegistryModels());
      })

      // POST /providers — add provider
      .post("/providers", async (c) => {
        try {
          const body = await c.req.json();
          const config = configService.getConfig();
          const updated = await configService.updateConfig({
            ...config,
            providers: [...config.providers, body],
          });
          return c.json(updated.providers, 201);
        } catch (error: unknown) {
          if (error instanceof ZodError) {
            return c.json(
              { error: "Validation failed", details: error.issues },
              400,
            );
          }
          throw error;
        }
      })

      // DELETE /providers/:id — remove provider
      .delete("/providers/:id", async (c) => {
        const id = c.req.param("id");
        const config = configService.getConfig();
        const filtered = config.providers.filter(
          (p) => getProviderId(p) !== id,
        );
        if (filtered.length === config.providers.length) {
          return c.json({ error: `Provider "${id}" not found` }, 404);
        }
        const updated = await configService.updateConfig({
          ...config,
          providers: filtered,
        });
        return c.json(updated.providers);
      })

      // GET /settings
      .get("/settings", (c) => {
        return c.json(configService.getConfig().settings);
      })

      // PATCH /settings
      .patch("/settings", async (c) => {
        try {
          const body = await c.req.json();
          const config = configService.getConfig();
          const updated = await configService.updateConfig({
            ...config,
            settings: { ...config.settings, ...body },
          });
          return c.json(updated.settings);
        } catch (error: unknown) {
          if (error instanceof ZodError) {
            return c.json(
              { error: "Validation failed", details: error.issues },
              400,
            );
          }
          throw error;
        }
      })

      // GET /subscription — query subscription info from active provider
      .get("/subscription", async (c) => {
        const defaultId = configService.getConfig().settings.defaultProvider;
        const providerId = defaultId ?? (() => {
          const providers = configService.getConfig().providers;
          if (providers.length === 0) return null;
          const first = providers[0]!;
          return first.type === "zhipu" ? "zhipu" : first.id;
        })();

        if (!providerId) {
          return c.json(null);
        }

        try {
          const provider = registry.get(providerId);
          if (!hasSubscription(provider)) {
            return c.json(null);
          }
          const info = await provider.subscription.getSubscriptionInfo();
          return c.json(info);
        } catch {
          return c.json(null);
        }
      })
  );
}

function getProviderId(p: ProviderConfig): string {
  switch (p.type) {
    case "zhipu":
      return "zhipu";
    case "openai-compatible":
      return p.id;
  }
}
