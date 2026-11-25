/**
 * repo-intel queries — reads/writes of the `references` table, incl.
 * decl_file resolution through the import graph.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { clampIndexedName } from '../../../db/schema/context.js';
import { INSERT_CHUNK_SIZE } from './constants.js';
import type {
  CachedReferenceRow,
  IndexerReferenceRow,
  ResolvedCallerRow,
} from './types.js';

/** Cached references whose `toSymbol` matches any of the given names. */
export async function getCachedReferencesTo(
  db: Db,
  repoId: string,
  toSymbols: string[],
): Promise<CachedReferenceRow[]> {
  if (toSymbols.length === 0) return [];
  return db
    .select({
      fromPath: t.references.fromPath,
      toSymbol: t.references.toSymbol,
      line: t.references.line,
    })
    .from(t.references)
    .where(
      and(eq(t.references.repoId, repoId), inArray(t.references.toSymbol, toSymbols)),
    );
}

/** Resolved cross-file callers of symbols declared in `declFiles`. */
export async function getResolvedCallers(
  db: Db,
  repoId: string,
  declFiles: string[],
  names: string[],
): Promise<ResolvedCallerRow[]> {
  if (declFiles.length === 0 || names.length === 0) return [];
  return db
    .select({
      fromPath: t.references.fromPath,
      toSymbol: t.references.toSymbol,
      line: t.references.line,
      rank: t.fileRank.rank,
    })
    .from(t.references)
    .innerJoin(
      t.fileRank,
      and(
        eq(t.fileRank.repoId, t.references.repoId),
        eq(t.fileRank.filePath, t.references.fromPath),
      ),
    )
    .where(
      and(
        eq(t.references.repoId, repoId),
        inArray(t.references.declFile, declFiles),
        inArray(t.references.toSymbol, names),
      ),
    );
}

/** Batched insert into `references`. */
export async function insertReferences(db: Db, rows: IndexerReferenceRow[]): Promise<void> {
  if (rows.length === 0) return;
  const safe = rows.map((r) => ({ ...r, toSymbol: clampIndexedName(r.toSymbol) }));
  for (let i = 0; i < safe.length; i += INSERT_CHUNK_SIZE) {
    await db.insert(t.references).values(safe.slice(i, i + INSERT_CHUNK_SIZE));
  }
}

/**
 * Resolve `references.decl_file` through the import graph (step 5).
 * A reference `(from_path → to_symbol)` resolves to file `F` iff `from_path`
 * imports `F` AND `F` exports a symbol named `to_symbol` — and ONLY when that
 * candidate is unique. 0 or >1 candidates leave `decl_file = NULL` (which is
 * the honest "unresolved" signal, never a nearest-name guess).
 *
 * `reset: true` (incremental) first clears every decl_file so a changed
 * decl-file can't leave a stale resolution behind; full index inserts rows
 * with NULL decl_file already, so reset is unnecessary there.
 *
 * Quoted `"references"` — it's a SQL reserved word. The query is fully
 * parameterised on repoId (no injection surface).
 */
export async function resolveReferences(
  db: Db,
  repoId: string,
  opts: { reset: boolean },
): Promise<void> {
  if (opts.reset) {
    await db.execute(
      sql`UPDATE "references" SET decl_file = NULL WHERE repo_id = ${repoId}`,
    );
  }
  await db.execute(sql`
    WITH cand AS (
      SELECT r.id AS ref_id, e.to_file AS decl
      FROM "references" r
      JOIN file_edges e ON e.repo_id = r.repo_id AND e.from_file = r.from_path
      JOIN symbols s ON s.repo_id = r.repo_id AND s.path = e.to_file
                    AND s.name = r.to_symbol AND s.exported = true
      WHERE r.repo_id = ${repoId}
      GROUP BY r.id, e.to_file
    ),
    uniq AS (
      SELECT ref_id FROM cand GROUP BY ref_id HAVING count(*) = 1
    )
    UPDATE "references" r
    SET decl_file = c.decl
    FROM cand c
    JOIN uniq u ON u.ref_id = c.ref_id
    WHERE r.id = c.ref_id
  `);
}
