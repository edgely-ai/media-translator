export type DatabaseValue =
  | string
  | number
  | boolean
  | null
  | Date
  | Record<string, unknown>
  | readonly DatabaseValue[];

export interface DatabaseQueryResult<TRow> {
  rows: TRow[];
  rowCount: number;
}

export interface DatabaseExecutor {
  query<TRow>(
    sql: string,
    params?: readonly DatabaseValue[],
  ): Promise<DatabaseQueryResult<TRow>>;
}

export class DatabaseRecordNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseRecordNotFoundError";
  }
}

export class DatabaseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConflictError";
  }
}

export async function queryMany<TRow>(
  db: DatabaseExecutor,
  sql: string,
  params: readonly DatabaseValue[] = [],
): Promise<TRow[]> {
  const result = await db.query<TRow>(sql, params);

  return result.rows;
}

export async function queryOne<TRow>(
  db: DatabaseExecutor,
  sql: string,
  params: readonly DatabaseValue[] = [],
): Promise<TRow | null> {
  const result = await db.query<TRow>(sql, params);

  if (result.rowCount === 0) {
    return null;
  }

  if (result.rowCount > 1) {
    throw new DatabaseConflictError(
      `Expected one row but received ${result.rowCount}.`,
    );
  }

  return result.rows[0] ?? null;
}

export async function requireOne<TRow>(
  db: DatabaseExecutor,
  sql: string,
  params: readonly DatabaseValue[] = [],
  message = "Expected a database record but none was found.",
): Promise<TRow> {
  const row = await queryOne<TRow>(db, sql, params);

  if (!row) {
    throw new DatabaseRecordNotFoundError(message);
  }

  return row;
}
