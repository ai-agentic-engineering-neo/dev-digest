/**
 * repo-intel queries — reads/writes of the `symbols` table (plus the
 * symbols+references wipes the indexer runs before re-parsing).
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { clampIndexedName } from '../../../db/schema/context.js';
import { INSERT_CHUNK_SIZE } from './constants.js';
import type {
  CachedSymbolRow,
  FullSymbolRow,
  IndexerSymbolRow,
} from './types.js';

/** All cached symbols for a repo (from blast's persistence). */
export async function getCachedSymbols(db: Db, repoId: string): Promise<CachedSymbolRow[]> {
  return db
    .select({
      path: t.symbols.path,
      name: t.symbols.name,
      kind: t.symbols.kind,
      line: t.symbols.line,
    })
    .from(t.symbols)
    .where(eq(t.symbols.repoId, repoId));
}

/** Cached symbols restricted to the given file paths. */
export async function getCachedSymbolsForFiles(
  db: Db,
  repoId: string,
  paths: string[],
): Promise<CachedSymbolRow[]> {
  if (paths.length === 0) return [];
  return db
    .select({
      path: t.symbols.path,
      name: t.symbols.name,
      kind: t.symbols.kind,
      line: t.symbols.line,
    })
    .from(t.symbols)
    .where(and(eq(t.symbols.repoId, repoId), inArray(t.symbols.path, paths)));
}

/** Full symbol rows (T2 columns) for the given files. */
export async function getSymbolRows(
  db: Db,
  repoId: string,
  paths: string[],
): Promise<FullSymbolRow[]> {
  if (paths.length === 0) return [];
  return db
    .select({
      path: t.symbols.path,
      name: t.symbols.name,
      kind: t.symbols.kind,
      line: t.symbols.line,
      endLine: t.symbols.endLine,
      exported: t.symbols.exported,
      signature: t.symbols.signature,
    })
    .from(t.symbols)
    .where(and(eq(t.symbols.repoId, repoId), inArray(t.symbols.path, paths)));
}

/** Batched insert into `symbols`. Uses the same chunk size as blast. */
export async function insertSymbols(db: Db, rows: IndexerSymbolRow[]): Promise<void> {
  if (rows.length === 0) return;
  // Clamp the indexed `name` so a pathological multi-KB identifier can't blow
  // the btree row-size limit and crash the indexer (see clampIndexedName).
  const safe = rows.map((r) => ({ ...r, name: clampIndexedName(r.name) }));
  for (let i = 0; i < safe.length; i += INSERT_CHUNK_SIZE) {
    await db.insert(t.symbols).values(safe.slice(i, i + INSERT_CHUNK_SIZE));
  }
}

/** Wipe every cached symbol + reference row for a repo (full-index reset). */
export async function deleteAllForRepo(db: Db, repoId: string): Promise<void> {
  await db.delete(t.symbols).where(eq(t.symbols.repoId, repoId));
  await db.delete(t.references).where(eq(t.references.repoId, repoId));
}

/**
 * Wipe symbols whose `path` is in `paths` and references whose `fromPath`
 * is in `paths`. Used by the incremental indexer before re-parsing a slice.
 * Inline-empty guard keeps the no-op refresh path zero-DB.
 */
export async function deleteForFiles(db: Db, repoId: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await db
    .delete(t.symbols)
    .where(and(eq(t.symbols.repoId, repoId), inArray(t.symbols.path, paths)));
  await db
    .delete(t.references)
    .where(
      and(eq(t.references.repoId, repoId), inArray(t.references.fromPath, paths)),
    );
}
