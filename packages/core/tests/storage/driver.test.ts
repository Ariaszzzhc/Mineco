import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Kysely, CompiledQuery, SqliteQueryCompiler, sql } from "kysely";
import type { CompiledQuery as CompiledQueryType } from "kysely";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { NodeSqliteDialect } from "../../src/storage/dialect.js";
import { SqliteDriver } from "../../src/storage/driver.js";

interface TestDb {
  counters: {
    id: string;
    value: number;
  };
}

describe("SqliteDriver", () => {
  let dbPath: string;
  let db: Kysely<TestDb>;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const dir = join(tmpdir(), `mineco-driver-test-${randomUUID()}`);
    await mkdir(dir, { recursive: true });
    dbPath = join(dir, "test.db");
    db = new Kysely<TestDb>({ dialect: new NodeSqliteDialect(dbPath) });
    await sql`CREATE TABLE IF NOT EXISTS counters (id TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)`.execute(db);
    cleanup = async () => {
      await db.destroy();
      await rm(dir, { recursive: true, force: true });
    };
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("connection getter", () => {
    it("should throw before init", () => {
      const driver = new SqliteDriver(":memory:");
      expect(() => driver.connection).toThrow("Driver not initialized");
    });

    it("should return connection after init", async () => {
      const driver = new SqliteDriver(":memory:");
      await driver.init();
      expect(driver.connection).toBeDefined();
      await driver.destroy();
    });
  });

  describe("transactions", () => {
    it("should commit a transaction", async () => {
      await db.transaction().execute(async (trx) => {
        await trx.insertInto("counters").values({ id: "a", value: 1 }).execute();
        const row = await trx.selectFrom("counters").selectAll().where("id", "=", "a").executeTakeFirst();
        expect(row).toBeDefined();
        expect(row!.value).toBe(1);
      });

      // Verify committed
      const row = await db.selectFrom("counters").selectAll().where("id", "=", "a").executeTakeFirst();
      expect(row).toBeDefined();
    });

    it("should rollback a transaction on error", async () => {
      await expect(
        db.transaction().execute(async (trx) => {
          await trx.insertInto("counters").values({ id: "b", value: 2 }).execute();
          throw new Error("rollback test");
        }),
      ).rejects.toThrow("rollback test");

      // Verify rolled back
      const row = await db.selectFrom("counters").selectAll().where("id", "=", "b").executeTakeFirst();
      expect(row).toBeUndefined();
    });
  });

  describe("savepoints", () => {
    it("should execute savepoint, rollback to savepoint, and release", async () => {
      const dialect = new NodeSqliteDialect(dbPath);
      const driver = dialect.createDriver() as SqliteDriver;
      await (driver as unknown as { init: () => Promise<void> }).init();

      try {
        const connection = driver.connection;
        const compiler = new SqliteQueryCompiler();

        // Begin outer transaction
        await driver.beginTransaction(connection, { isolationLevel: undefined });

        // Insert a row
        await connection.executeQuery(CompiledQuery.raw(
          "INSERT INTO counters (id, value) VALUES ('sp', 10)",
          [],
          { kind: "InsertQueryNode" },
        ));

        // Create savepoint via driver's savepoint method
        await driver.savepoint(connection, "sp1", compiler.compileQuery.bind(compiler));

        // Update within savepoint
        await connection.executeQuery(CompiledQuery.raw(
          "UPDATE counters SET value = 99 WHERE id = 'sp'",
          [],
          { kind: "UpdateQueryNode" },
        ));

        // Verify updated value
        let result = await connection.executeQuery<{ value: number }>(CompiledQuery.raw(
          "SELECT value FROM counters WHERE id = 'sp'",
          [],
          { kind: "SelectQueryNode" },
        ));
        expect(result.rows[0]!.value).toBe(99);

        // Rollback to savepoint via driver's method
        await driver.rollbackToSavepoint(connection, "sp1", compiler.compileQuery.bind(compiler));

        // Verify rolled back to savepoint
        result = await connection.executeQuery<{ value: number }>(CompiledQuery.raw(
          "SELECT value FROM counters WHERE id = 'sp'",
          [],
          { kind: "SelectQueryNode" },
        ));
        expect(result.rows[0]!.value).toBe(10);

        // Release savepoint via driver's method
        await driver.releaseSavepoint(connection, "sp1", compiler.compileQuery.bind(compiler));

        // Commit outer transaction
        await driver.commitTransaction(connection);
      } finally {
        await driver.destroy();
      }
    });
  });

  describe("destroy and asyncDispose", () => {
    it("should close the underlying connection on destroy", async () => {
      const driver = new SqliteDriver(":memory:");
      await driver.init();
      const conn = driver.connection;
      await driver.destroy();
      // Connection is closed; subsequent operations should fail
      await expect(conn.executeQuery(CompiledQuery.raw(
        "SELECT 1",
        [],
        { kind: "SelectQueryNode" },
      ))).rejects.toThrow();
    });

    it("should support Symbol.asyncDispose", async () => {
      const driver = new SqliteDriver(":memory:");
      await driver.init();
      await using disposable = driver;
      // When the block exits, asyncDispose should be called
    });
  });
});
