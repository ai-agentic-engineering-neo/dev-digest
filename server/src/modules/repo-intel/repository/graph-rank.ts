/** repo-intel queries — Import graph (`file_edges`) and PageRank output (`file_rank`). */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { FileRankRow } from '../types.js';
import { INSERT_CHUNK_SIZE } from './constants.js';
import type { IndexerEdgeRow, IndexerFileRankRow } from './types.js';

/** Replace the whole import-graph for a repo (full index / incremental). */
export async function replaceEdges(db: Db, repoId: string, edges: IndexerEdgeRow[]): Promise<void> {
  await db.delete(t.fileEdges).where(eq(t.fileEdges.repoId, repoId));
  if (edges.length === 0) return;
  const rows = edges.map((e) => ({ repoId, fromFile: e.fromFile, toFile: e.toFile }));
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    await db.insert(t.fileEdges).values(rows.slice(i, i + INSERT_CHUNK_SIZE));
  }
}

/** All import edges for a repo (rank graph build + critical-paths). */
export async function getEdges(db: Db, repoId: string): Promise<IndexerEdgeRow[]> {
  return db
    .select({ fromFile: t.fileEdges.fromFile, toFile: t.fileEdges.toFile })
    .from(t.fileEdges)
    .where(eq(t.fileEdges.repoId, repoId));
}

/** Replace the whole file_rank table for a repo. */
export async function replaceFileRank(
  db: Db,
  repoId: string,
  rows: IndexerFileRankRow[],
): Promise<void> {
  await db.delete(t.fileRank).where(eq(t.fileRank.repoId, repoId));
  if (rows.length === 0) return;
  const values = rows.map((r) => ({ repoId, ...r }));
  for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
    await db.insert(t.fileRank).values(values.slice(i, i + INSERT_CHUNK_SIZE));
  }
}

/** `{path, percentile}` for the given paths (smart-diff / run-executor). */
export async function getFileRankFor(
  db: Db,
  repoId: string,
  paths: string[],
): Promise<FileRankRow[]> {
  if (paths.length === 0) return [];
  return db
    .select({ path: t.fileRank.filePath, percentile: t.fileRank.percentile })
    .from(t.fileRank)
    .where(and(eq(t.fileRank.repoId, repoId), inArray(t.fileRank.filePath, paths)));
}

/** Top `limit` paths by rank DESC (caller filters tests/configs in JS). */
export async function getRankedPaths(
  db: Db,
  repoId: string,
  limit: number,
): Promise<Array<{ path: string; rank: number }>> {
  return db
    .select({ path: t.fileRank.filePath, rank: t.fileRank.rank })
    .from(t.fileRank)
    .where(eq(t.fileRank.repoId, repoId))
    .orderBy(desc(t.fileRank.rank))
    .limit(limit);
}
