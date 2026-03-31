import type { DatabaseSync } from "node:sqlite";
import type { DatabaseIntrospector, Dialect, Driver } from "kysely";
import {
  type Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import { SqliteDriver } from "./driver.js";

export class NodeSqliteDialect implements Dialect {
  readonly #args: ConstructorParameters<typeof DatabaseSync>;

  constructor(...args: ConstructorParameters<typeof DatabaseSync>) {
    this.#args = args;
  }

  createAdapter(): SqliteAdapter {
    return new SqliteAdapter();
  }

  createDriver(): Driver {
    return new SqliteDriver(...this.#args);
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }

  createQueryCompiler(): SqliteQueryCompiler {
    return new SqliteQueryCompiler();
  }
}
