import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { schema } from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * The transaction handle `Db['transaction']` hands its callback — extracted
 * via the callback parameter rather than hardcoding Drizzle's `PgTransaction`
 * generic signature, so it stays correct if that signature changes.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * A repository method that must be usable both standalone and inside a
 * caller-owned transaction takes `DbOrTx` for the query handle: the caller
 * (a service, per onion-architecture's "caller owns the transaction, the
 * repository receives it") passes a `Tx` when the call is one unit of work
 * with siblings, or omits it to use the shared pooled `Db`.
 */
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

/**
 * Create a Drizzle client over postgres-js. Used by the app (one shared handle)
 * and by the Testcontainers harness (per-test handle).
 */
export function createDb(databaseUrl: string, opts?: { max?: number }): DbHandle {
  const sql = postgres(databaseUrl, { max: opts?.max ?? 10 });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
