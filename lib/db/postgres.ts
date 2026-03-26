import { Pool, type PoolClient, type QueryResult } from "pg";

import type {
  DatabaseExecutor,
  DatabaseQueryResult,
  DatabaseValue,
  TransactionCapableDatabaseExecutor,
} from "@/lib/db/client";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer when provided.`);
  }

  return parsed;
}

function mapQueryResult<TRow>(result: QueryResult): DatabaseQueryResult<TRow> {
  return {
    rows: result.rows as TRow[],
    rowCount: result.rowCount ?? result.rows.length,
  };
}

let postgresPool: Pool | null = null;

export class PostgresQueryExecutor implements DatabaseExecutor {
  constructor(private readonly pool: Pool) {}

  async query<TRow>(
    sql: string,
    params: readonly DatabaseValue[] = [],
  ): Promise<DatabaseQueryResult<TRow>> {
    const result = await this.pool.query(sql, [...params]);

    return mapQueryResult<TRow>(result);
  }
}

export class PostgresTransactionExecutor
  implements TransactionCapableDatabaseExecutor
{
  private inTransaction = false;

  constructor(private readonly client: PoolClient) {}

  async query<TRow>(
    sql: string,
    params: readonly DatabaseValue[] = [],
  ): Promise<DatabaseQueryResult<TRow>> {
    const result = await this.client.query(sql, [...params]);

    return mapQueryResult<TRow>(result);
  }

  async transaction<T>(callback: (db: DatabaseExecutor) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      throw new Error(
        "Nested postgres transactions are not supported by PostgresTransactionExecutor.",
      );
    }

    this.inTransaction = true;
    await this.client.query("BEGIN");

    try {
      const result = await callback(this);

      await this.client.query("COMMIT");

      return result;
    } catch (error) {
      try {
        await this.client.query("ROLLBACK");
      } catch (rollbackError) {
        const rollbackMessage =
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError);

        if (error instanceof Error) {
          error.cause = {
            rollbackError: rollbackMessage,
            originalCause: error.cause,
          };
        }
      }

      throw error;
    } finally {
      this.inTransaction = false;
    }
  }
}

export function getPostgresPool(): Pool {
  if (postgresPool) {
    return postgresPool;
  }

  postgresPool = new Pool({
    connectionString: requireEnv("DATABASE_URL"),
    max: parsePositiveIntegerEnv("WORKER_DB_POOL_MAX", 4),
  });

  return postgresPool;
}

export function getPostgresQueryExecutor(): PostgresQueryExecutor {
  return new PostgresQueryExecutor(getPostgresPool());
}

export async function withPostgresClient<T>(
  callback: (
    db: PostgresTransactionExecutor,
    client: PoolClient,
  ) => Promise<T>,
): Promise<T> {
  const client = await getPostgresPool().connect();
  const db = new PostgresTransactionExecutor(client);

  try {
    return await callback(db, client);
  } finally {
    client.release();
  }
}

export async function closePostgresPool(): Promise<void> {
  if (!postgresPool) {
    return;
  }

  const pool = postgresPool;
  postgresPool = null;
  await pool.end();
}
