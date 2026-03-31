import { vi } from "vitest";
import type { AppConfig } from "../../src/config/schema.js";
import type { ConfigService } from "../../src/config/service.js";

export function createMockConfigService(
  initialConfig: AppConfig = { providers: [], settings: {} },
): ConfigService {
  let config = initialConfig;

  return {
    getConfig: vi.fn(() => config),
    getMaskedConfig: vi.fn(() => ({
      ...config,
      providers: config.providers.map((p) =>
        p.type === "zhipu" ? { ...p, apiKey: "sk-p...xxxx" } : p,
      ),
    })),
    updateConfig: vi.fn(async (raw: unknown) => {
      config = raw as AppConfig;
      return {
        ...config,
        providers: config.providers.map((p) =>
          p.type === "zhipu" ? { ...p, apiKey: "sk-p...xxxx" } : p,
        ),
      };
    }),
    initialize: vi.fn(async () => {}),
  } as unknown as ConfigService;
}
