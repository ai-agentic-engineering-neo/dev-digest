/**
 * repo-intel queries — per-file facts (`file_facts`: endpoints/crons) the
 * indexer writes for blast.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { INSERT_CHUNK_SIZE } from './constants.js';
import type { IndexerFileFactsRow } from './types.js';

/** Replace per-file facts; only rows with at least one endpoint/cron persist. */
export async function replaceFileFacts(
  db: Db,
  repoId: string,
  rows: IndexerFileFactsRow[],
): Promise<void> {
  await db.delete(t.fileFacts).where(eq(t.fileFacts.repoId, repoId));
  const nonEmpty = rows.filter((r) => r.endpoints.length > 0 || r.crons.length > 0);
  if (nonEmpty.length === 0) return;
  const values = nonEmpty.map((r) => ({
    repoId,
    filePath: r.filePath,
    endpoints: r.endpoints,
    crons: r.crons,
  }));
  for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
    await db.insert(t.fileFacts).values(values.slice(i, i + INSERT_CHUNK_SIZE));
  }
}

/**
 * Patch facts for a slice of files (incremental): drop the changed files'
 * rows, then insert the non-empty ones. Unchanged files keep their facts.
 */
export async function patchFileFacts(
  db: Db,
  repoId: string,
  files: string[],
  rows: IndexerFileFactsRow[],
): Promise<void> {
  if (files.length > 0) {
    await db
      .delete(t.fileFacts)
      .where(and(eq(t.fileFacts.repoId, repoId), inArray(t.fileFacts.filePath, files)));
  }
  const nonEmpty = rows.filter((r) => r.endpoints.length > 0 || r.crons.length > 0);
  if (nonEmpty.length === 0) return;
  const values = nonEmpty.map((r) => ({
    repoId,
    filePath: r.filePath,
    endpoints: r.endpoints,
    crons: r.crons,
  }));
  for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
    await db.insert(t.fileFacts).values(values.slice(i, i + INSERT_CHUNK_SIZE));
  }
}

/** Per-file facts (endpoints/crons) for the given files. */
export async function getFileFacts(
  db: Db,
  repoId: string,
  files: string[],
): Promise<IndexerFileFactsRow[]> {
  if (files.length === 0) return [];
  const rows = await db
    .select({
      filePath: t.fileFacts.filePath,
      endpoints: t.fileFacts.endpoints,
      crons: t.fileFacts.crons,
    })
    .from(t.fileFacts)
    .where(and(eq(t.fileFacts.repoId, repoId), inArray(t.fileFacts.filePath, files)));
  return rows.map((r) => ({
    filePath: r.filePath,
    endpoints: (r.endpoints as string[]) ?? [],
    crons: (r.crons as string[]) ?? [],
  }));
}
