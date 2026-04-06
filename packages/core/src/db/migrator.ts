import {
  type Kysely,
  Migrator,
} from "kysely";
import { getMigrationProvider } from "./migration-provider.js";

// biome-ignore lint/suspicious/noExplicitAny: Kysely migration API requires any
export async function migrateToLatest(db: Kysely<any>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: getMigrationProvider(),
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
