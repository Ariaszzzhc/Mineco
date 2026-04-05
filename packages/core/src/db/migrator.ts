import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  type Kysely,
  type Migration,
  type MigrationProvider,
  Migrator,
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

// biome-ignore lint/suspicious/noExplicitAny: Kysely migration API requires any
export async function migrateToLatest(db: Kysely<any>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new CompatibleFileMigrationProvider(
      path.join(__dirname, "migrations"),
    ),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`migration "${it.migrationName}" executed successfully`);
    } else if (it.status === "Error") {
      console.error(`migration "${it.migrationName}" failed`);
    }
  });

  if (error) {
    console.error("migration failed", error);
    process.exit(1);
  }
}
