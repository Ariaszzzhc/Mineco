import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Kysely } from "kysely";
import { NodeSqliteDialect } from "../../src/storage/dialect.js";
import type { Database } from "../../src/storage/schema.js";
import { initializeSchema } from "../../src/storage/schema.js";

export async function createTestDb(): Promise<{
  db: Kysely<Database>;
  cleanup: () => Promise<void>;
}> {
  const dir = join(tmpdir(), `mineco-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  const dbPath = join(dir, "test.db");
  const db = new Kysely<Database>({ dialect: new NodeSqliteDialect(dbPath) });
  await initializeSchema(db);
  const cleanup = async () => {
    await db.destroy();
    await rm(dir, { recursive: true, force: true });
  };
  return { db, cleanup };
}
