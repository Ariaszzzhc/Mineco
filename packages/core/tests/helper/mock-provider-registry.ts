import type { ProviderRegistry } from "@mineco/provider";
import { vi } from "vitest";

export function createMockProviderRegistry(): ProviderRegistry {
  return {
    register: vi.fn(),
    registerFromConfig: vi.fn(),
    clear: vi.fn(),
    get: vi.fn(() => {
      throw new Error("Provider not found");
    }),
    list: vi.fn(() => []),
    usage: {
      record: vi.fn(),
      getSummary: vi.fn(() => ({})),
    } as unknown as ProviderRegistry["usage"],
  } as unknown as ProviderRegistry;
}
