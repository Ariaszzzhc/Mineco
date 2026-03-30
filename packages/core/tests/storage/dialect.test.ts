import { describe, expect, it } from "vitest";
import { Kysely, SqliteIntrospector, SqliteAdapter, SqliteQueryCompiler } from "kysely";
import { NodeSqliteDialect } from "../../src/storage/dialect.js";

describe("NodeSqliteDialect", () => {
  it("should create a SqliteAdapter", () => {
    const dialect = new NodeSqliteDialect(":memory:");
    const adapter = dialect.createAdapter();
    expect(adapter).toBeInstanceOf(SqliteAdapter);
  });

  it("should create a SqliteDriver", () => {
    const dialect = new NodeSqliteDialect(":memory:");
    const driver = dialect.createDriver();
    expect(driver).toBeDefined();
  });

  it("should create a SqliteIntrospector", () => {
    const dialect = new NodeSqliteDialect(":memory:");
    const db = new Kysely<unknown>({ dialect });
    const introspector = dialect.createIntrospector(db);
    expect(introspector).toBeInstanceOf(SqliteIntrospector);
  });

  it("should create a SqliteQueryCompiler", () => {
    const dialect = new NodeSqliteDialect(":memory:");
    const compiler = dialect.createQueryCompiler();
    expect(compiler).toBeInstanceOf(SqliteQueryCompiler);
  });
});
