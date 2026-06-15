import type { DatabaseSync } from "node:sqlite";
import {
  CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  SelectQueryNode,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";

/**
 * A minimal Kysely dialect over Node 24's built-in `node:sqlite`, inlined
 * (rather than pulled as a dependency) so mineco keeps its small footprint.
 * Distilled from `kysely-node-sqlite` — the SQLite adapter/compiler/introspector
 * are reused from Kysely itself; only the driver/connection is custom, since
 * that is the only part that touches `DatabaseSync`.
 *
 * `node:sqlite` is fully synchronous and we open a single shared connection. We
 * therefore skip the statement cache, mutex, and custom error mapping the
 * upstream library adds — there is no real concurrency to guard, and we don't
 * (yet) use transactions.
 */
class NodeSqliteConnection implements DatabaseConnection {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const { sql, parameters, query } = compiledQuery;
    const stmt = this.#db.prepare(sql);
    // node:sqlite binds positional params as plain args.
    const params = parameters as SupportedValue[];

    if (SelectQueryNode.is(query)) {
      return Promise.resolve({ rows: stmt.all(...params) as O[] });
    }

    const { changes, lastInsertRowid } = stmt.run(...params);
    return Promise.resolve({
      rows: [],
      numAffectedRows: typeof changes === "bigint" ? changes : BigInt(changes),
      insertId:
        typeof lastInsertRowid === "bigint"
          ? lastInsertRowid
          : BigInt(lastInsertRowid),
    });
  }

  async *streamQuery<R>(
    compiledQuery: CompiledQuery,
  ): AsyncIterableIterator<QueryResult<R>> {
    const { sql, parameters, query } = compiledQuery;
    if (!SelectQueryNode.is(query)) {
      throw new Error("node:sqlite streaming only supports SELECT queries.");
    }
    const stmt = this.#db.prepare(sql);
    for (const row of stmt.iterate(...(parameters as SupportedValue[]))) {
      yield { rows: [row as R] };
    }
  }
}

/** The value types `node:sqlite` accepts as bound parameters. */
type SupportedValue = null | number | bigint | string | Uint8Array;

class NodeSqliteDriver implements Driver {
  readonly #connection: NodeSqliteConnection;

  constructor(db: DatabaseSync) {
    this.#connection = new NodeSqliteConnection(db);
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.#connection;
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("BEGIN"));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("COMMIT"));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {}
}

/** Kysely dialect backed by an already-open `node:sqlite` `DatabaseSync`. */
export class NodeSqliteDialect implements Dialect {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  createDriver(): Driver {
    return new NodeSqliteDriver(this.#db);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}
