import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { CompiledQuery, DatabaseConnection, QueryResult } from "kysely";

export class SqliteConnection implements DatabaseConnection, Disposable {
  #db: DatabaseSync;

  constructor(...args: ConstructorParameters<typeof DatabaseSync>) {
    this.#db = new DatabaseSync(...args);
  }

  [Symbol.dispose](): void {
    this.#db.close();
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const { sql, parameters, query } = compiledQuery;
    const stmt = this.#db.prepare(sql);

    let useAll = false;

    if (query.kind === "SelectQueryNode") {
      useAll = true;
    } else if (
      query.kind === "InsertQueryNode" ||
      query.kind === "UpdateQueryNode" ||
      query.kind === "DeleteQueryNode"
    ) {
      if (sql.toLowerCase().includes("returning")) {
        useAll = true;
      }
    } else if (query.kind === "RawNode") {
      const lowerSql = sql.toLowerCase().trim();
      if (
        lowerSql.startsWith("select") ||
        lowerSql.startsWith("pragma") ||
        lowerSql.startsWith("with") ||
        lowerSql.includes("returning")
      ) {
        useAll = true;
      }
    }

    if (useAll) {
      const rows = stmt.all(...(parameters as SQLInputValue[])) as R[];
      return { rows };
    } else {
      const result = stmt.run(...(parameters as SQLInputValue[]));
      return {
        rows: [],
        insertId: BigInt(result.lastInsertRowid),
        numAffectedRows: BigInt(result.changes),
      };
    }
  }

  async *streamQuery<R>(
    compiledQuery: CompiledQuery,
  ): AsyncIterableIterator<QueryResult<R>> {
    const result = await this.executeQuery<R>(compiledQuery);
    if (result.rows) {
      yield { rows: result.rows };
    }
  }
}
