import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type Migration,
  type MigrationProvider,
} from "kysely";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Custom provider that uses pathToFileURL for Windows ESM compatibility. */
class CompatibleFileMigrationProvider implements MigrationProvider {
  readonly #folder: string;

  constructor(folder: string) {
    this.#folder = folder;
  }

  async getMigrations(): Promise<Record<string, Migration>> {
    const migrations: Record<string, Migration> = {};
    const files = await fs.readdir(this.#folder);

    for (const file of files) {
      if (!/\.(ts|js|mjs)$/.test(file)) continue;

      const migrationName = file.replace(/\.[^.]+$/, "");
      const url = pathToFileURL(path.join(this.#folder, file)).href;
      const migration = await import(url);
      migrations[migrationName] = migration;
    }

    return migrations;
  }
}

export function getMigrationProvider(): MigrationProvider {
  return new CompatibleFileMigrationProvider(
    path.join(__dirname, "migrations"),
  );
}
