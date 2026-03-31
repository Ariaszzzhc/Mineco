import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "./schema.js";
import { configSchema } from "./schema.js";

const CONFIG_DIR = ".mineco";
const CONFIG_FILE = "config.json";

export function getConfigPath(): string {
  return join(homedir(), CONFIG_DIR, CONFIG_FILE);
}

export function getConfigDir(): string {
  return join(homedir(), CONFIG_DIR);
}

export async function loadConfig(): Promise<AppConfig> {
  const configPath = getConfigPath();

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return createDefaultConfig();
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  return configSchema.parse(parsed);
}

export async function createDefaultConfig(): Promise<AppConfig> {
  const configDir = getConfigDir();
  await mkdir(configDir, { recursive: true });

  const defaultConfig = configSchema.parse({});
  await saveConfig(defaultConfig);
  return defaultConfig;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const configDir = getConfigDir();
  await mkdir(configDir, { recursive: true });

  const json = JSON.stringify(config, null, 2);
  await writeFile(getConfigPath(), json, "utf-8");
}
