import { Hono } from "hono";
import { ZodError } from "zod";
import type { ConfigService } from "../config/service.js";
import type { ProviderConfig } from "../config/schema.js";

export function createConfigRoutes(
  configService: ConfigService,
  getRegistryModels: () => Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>,
): Hono {
  const router = new Hono();

  // GET / — full config (masked)
  router.get("/", (c) => {
    return c.json({ data: configService.getMaskedConfig() });
  });

  // PUT / — replace full config
  router.put("/", async (c) => {
    try {
      const body = await c.req.json();
      const updated = await configService.updateConfig(body);
      return c.json({ data: updated });
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return c.json(
          { error: "Validation failed", details: error.issues },
          400,
        );
      }
      throw error;
    }
  });

  // GET /providers — list providers (masked)
  router.get("/providers", (c) => {
    const config = configService.getMaskedConfig();
    return c.json({ data: config.providers });
  });

  // GET /providers/models — list providers with available models from registry
  router.get("/providers/models", (c) => {
    return c.json({ data: getRegistryModels() });
  });

  // POST /providers — add provider
  router.post("/providers", async (c) => {
    try {
      const body = await c.req.json();
      const config = configService.getConfig();
      const updated = await configService.updateConfig({
        ...config,
        providers: [...config.providers, body],
      });
      return c.json({ data: updated.providers }, 201);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return c.json(
          { error: "Validation failed", details: error.issues },
          400,
        );
      }
      throw error;
    }
  });

  // DELETE /providers/:id — remove provider
  router.delete("/providers/:id", async (c) => {
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
    return c.json({ data: updated.providers });
  });

  // GET /settings
  router.get("/settings", (c) => {
    return c.json({ data: configService.getConfig().settings });
  });

  // PATCH /settings
  router.patch("/settings", async (c) => {
    try {
      const body = await c.req.json();
      const config = configService.getConfig();
      const updated = await configService.updateConfig({
        ...config,
        settings: { ...config.settings, ...body },
      });
      return c.json({ data: updated.settings });
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return c.json(
          { error: "Validation failed", details: error.issues },
          400,
        );
      }
      throw error;
    }
  });

  return router;
}

function getProviderId(p: ProviderConfig): string {
  switch (p.type) {
    case "zhipu":
      return "zhipu";
    case "openai-compatible":
      return p.id;
  }
}
