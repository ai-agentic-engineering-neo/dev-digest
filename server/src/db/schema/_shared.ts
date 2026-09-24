import { sql, type SQL } from 'drizzle-orm';
import { check, timestamp, type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Shared internal column helpers for the schema domain files. NOT re-exported
 * by the `db/schema.ts` barrel — it stays out of the public schema surface.
 */

/** Standard `created_at` column: timestamptz, defaults to now(), not null. */
export const now = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

/** `'a', 'b'` — SQL string literals for a fixed, code-owned value list (never user input). */
function literalList(values: readonly string[]): SQL {
  return sql.raw(values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', '));
}

/**
 * CHECK constraint pinning an enum-like text column to its allowed values, so a
 * bad write fails in Postgres (23514) instead of landing silently. NULL passes
 * (nullability is the column's job). Name: `<table>_<column>_chk`.
 */
export const enumCheck = (name: string, column: AnyPgColumn, values: readonly string[]) =>
  check(name, sql`${column} IN (${literalList(values)})`);
