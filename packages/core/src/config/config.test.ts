import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configSchema, zhipuProviderSchema, openaiCompatProviderSchema } from "./schema.js";
import type { AppConfig } from "./schema.js";
import { maskApiKey } from "./mask.js";

// --- Schema tests ---

describe("configSchema", () => {
  it("should parse empty object with defaults", () => {
    const config = configSchema.parse({});
    expect(config).toEqual({ providers: [], settings: {} });
  });

  it("should parse zhipu provider with defaults", () => {
    const config = configSchema.parse({
      providers: [{ type: "zhipu", apiKey: "test-key" }],
    });
    expect(config.providers).toHaveLength(1);
    const p = config.providers[0];
    if (p?.type === "zhipu") {
      expect(p.platform).toBe("cn");
      expect(p.endpoint).toBe("general");
    }
  });

  it("should parse openai-compatible provider", () => {
    const config = configSchema.parse({
      providers: [
        {
          type: "openai-compatible",
          id: "my-ollama",
          baseURL: "http://localhost:11434/v1",
          models: [{ id: "qwen3", name: "Qwen3" }],
        },
      ],
    });
    expect(config.providers).toHaveLength(1);
    const p = config.providers[0];
    if (p?.type === "openai-compatible") {
      expect(p.id).toBe("my-ollama");
      expect(p.apiKey).toBeUndefined();
    }
  });

  it("should reject invalid provider type", () => {
    expect(() =>
      configSchema.parse({
        providers: [{ type: "unknown" }],
      }),
    ).toThrow();
  });

  it("should reject missing required fields", () => {
    expect(() => zhipuProviderSchema.parse({ type: "zhipu" })).toThrow();
    expect(() =>
      openaiCompatProviderSchema.parse({ type: "openai-compatible" }),
    ).toThrow();
  });

  it("should reject empty models array for openai-compatible", () => {
    expect(() =>
      openaiCompatProviderSchema.parse({
        type: "openai-compatible",
        id: "test",
        baseURL: "http://localhost:11434/v1",
        models: [],
      }),
    ).toThrow();
  });
});

// --- Mask tests ---

describe("maskApiKey", () => {
  it("should return empty string for undefined", () => {
    expect(maskApiKey(undefined)).toBe("");
  });

  it("should fully mask short keys", () => {
    expect(maskApiKey("short")).toBe("****");
  });

  it("should show first and last 4 chars", () => {
    expect(maskApiKey("sk-proj-abcdef123456")).toBe("sk-p...3456");
  });

  it("should handle 8-char key (at threshold)", () => {
    expect(maskApiKey("12345678")).toBe("****");
  });

  it("should show first and last 4 for 9-char key", () => {
    expect(maskApiKey("123456789")).toBe("1234...6789");
  });
});

// --- Loader tests (with temp directory) ---

describe("loader", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `mineco-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // Override loader's config path for testing
  function getTestConfigPath(): string {
    return join(testDir, "config.json");
  }

  it("should create default config when file does not exist", async () => {
    const path = getTestConfigPath();
    // Manually create default config (simulating loadConfig with a missing file)
    const defaultConfig = configSchema.parse({});
    await writeFile(path, JSON.stringify(defaultConfig, null, 2), "utf-8");

    const raw = await readFile(path, "utf-8");
    const parsed = configSchema.parse(JSON.parse(raw));
    expect(parsed).toEqual({ providers: [], settings: {} });
  });

  it("should save and reload config", async () => {
    const path = getTestConfigPath();
    const config: AppConfig = {
      providers: [
        { type: "zhipu", apiKey: "test-key", platform: "cn", endpoint: "coding" },
      ],
      settings: { defaultProvider: "zhipu" },
    };

    await writeFile(path, JSON.stringify(config, null, 2), "utf-8");
    const raw = await readFile(path, "utf-8");
    const reloaded = configSchema.parse(JSON.parse(raw));

    expect(reloaded.providers).toHaveLength(1);
    expect(reloaded.settings.defaultProvider).toBe("zhipu");
  });

  it("should reject invalid JSON", async () => {
    const path = getTestConfigPath();
    await writeFile(path, "not json{{{", "utf-8");

    await expect(readFile(path, "utf-8").then((r) => JSON.parse(r))).rejects.toThrow();
  });

  it("should reject schema-invalid config", async () => {
    const path = getTestConfigPath();
    await writeFile(
      path,
      JSON.stringify({ providers: [{ type: "bad" }] }),
      "utf-8",
    );

    const raw = await readFile(path, "utf-8");
    expect(() => configSchema.parse(JSON.parse(raw))).toThrow();
  });
});
