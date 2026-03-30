import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Kysely, CompiledQuery, sql } from "kysely";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { NodeSqliteDialect } from "../../src/storage/dialect.js";
import { SqliteConnection } from "../../src/storage/connection.js";

interface TestDb {
  items: {
    id: string;
    name: string;
  };
}

describe("SqliteConnection", () => {
  let db: Kysely<TestDb>;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const dir = join(tmpdir(), `mineco-conn-test-${randomUUID()}`);
    await mkdir(dir, { recursive: true });
    const dbPath = join(dir, "test.db");
    db = new Kysely<TestDb>({ dialect: new NodeSqliteDialect(dbPath) });
    await sql`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, name TEXT NOT NULL)`.execute(db);
    cleanup = async () => {
      await db.destroy();
      await rm(dir, { recursive: true, force: true });
    };
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("RETURNING clause", () => {
    it("should return rows for INSERT with RETURNING", async () => {
      const result = await sql`INSERT INTO items (id, name) VALUES ('a', 'test') RETURNING *`.execute(db);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.name).toBe("test");
    });

    it("should return rows for INSERT ... RETURNING via Kysely builder", async () => {
      const result = await db
        .insertInto("items")
        .values({ id: "b", name: "via builder" })
        .returningAll()
        .execute();
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("via builder");
    });

    it("should return rows for DELETE with RETURNING", async () => {
      await sql`INSERT INTO items (id, name) VALUES ('a', 'test')`.execute(db);
      const result = await sql`DELETE FROM items WHERE id = 'a' RETURNING *`.execute(db);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.id).toBe("a");
    });
  });

  describe("PRAGMA query", () => {
    it("should return rows for PRAGMA query", async () => {
      const result = await sql`PRAGMA table_info(items)`.execute(db);
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe("streamQuery", () => {
    it("should yield rows from streamQuery", async () => {
      const conn = new SqliteConnection(":memory:");
      await conn.executeQuery(CompiledQuery.raw(
        "CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)",
        [],
        { kind: "RawNode" },
      ));
      await conn.executeQuery(CompiledQuery.raw(
        "INSERT INTO items (id, name) VALUES ('a', 'first'), ('b', 'second')",
        [],
        { kind: "RawNode" },
      ));

      const compiledQuery = CompiledQuery.raw(
        "SELECT * FROM items ORDER BY id",
        [],
        { kind: "SelectQueryNode" },
      );

      const rows: Array<{ id: string; name: string }> = [];
      for await (const chunk of conn.streamQuery<{ id: string; name: string }>(compiledQuery)) {
        rows.push(...(chunk.rows as Array<{ id: string; name: string }>));
      }
      expect(rows).toHaveLength(2);
      expect(rows[0]!.id).toBe("a");
      expect(rows[1]!.id).toBe("b");

      conn[Symbol.dispose]();
    });
  });
});
