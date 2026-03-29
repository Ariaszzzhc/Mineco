import { DatabaseSync } from "node:sqlite";
import type { DatabaseConnection, Driver, QueryCompiler, TransactionSettings } from "kysely";
import { CompiledQuery, IdentifierNode, RawNode, createQueryId } from "kysely";
import { Mutex } from "./mutex.js";
import { SqliteConnection } from "./connection.js";

export class SqliteDriver implements Driver {
  readonly #args: ConstructorParameters<typeof DatabaseSync>;
  #connection: SqliteConnection | null = null;
  #mutex = new Mutex();

  constructor(...args: ConstructorParameters<typeof DatabaseSync>) {
    this.#args = args;
  }

  get connection(): DatabaseConnection {
    if (!this.#connection) throw new Error("Driver not initialized");
    return this.#connection;
  }

  async init(): Promise<void> {
    this.#connection = new SqliteConnection(...this.#args);
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    await this.#mutex.lock();
    return this.connection;
  }

  async releaseConnection(): Promise<void> {
    this.#mutex.unlock();
  }

  async beginTransaction(_connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> {
    await this.connection.executeQuery(CompiledQuery.raw("BEGIN"));
  }

  async commitTransaction(_connection: DatabaseConnection): Promise<void> {
    await this.connection.executeQuery(CompiledQuery.raw("COMMIT"));
  }

  async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {
    await this.connection.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }

  async savepoint(
    _connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    await this.connection.executeQuery(
      compileQuery(savepointCommand("SAVEPOINT", savepointName), createQueryId()),
    );
  }

  async releaseSavepoint(
    _connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    await this.connection.executeQuery(
      compileQuery(savepointCommand("RELEASE SAVEPOINT", savepointName), createQueryId()),
    );
  }

  async rollbackToSavepoint(
    _connection: DatabaseConnection,
    savepointName: string,
    compileQuery: QueryCompiler["compileQuery"],
  ): Promise<void> {
    await this.connection.executeQuery(
      compileQuery(savepointCommand("ROLLBACK TO SAVEPOINT", savepointName), createQueryId()),
    );
  }

  async destroy(): Promise<void> {
    this.#connection?.[Symbol.dispose]();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy();
  }
}

function savepointCommand(
  command: "SAVEPOINT" | "RELEASE SAVEPOINT" | "ROLLBACK TO SAVEPOINT",
  savepointName: string,
): RawNode {
  return RawNode.createWithChildren([
    RawNode.createWithSql(command),
    IdentifierNode.create(savepointName),
  ]);
}
