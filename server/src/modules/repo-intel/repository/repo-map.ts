/**
 * repo-intel queries — Repo-map candidates (symbols x file_rank) and the `repo_map_cache` table.
 */
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { RepoMapCandidateRow } from './types.js';

/** Repo-map candidates: symbols with a signature, joined to rank, ordered. */
export async function getRepoMapCandidates(db: Db, repoId: string): Promise<RepoMapCandidateRow[]> {
  return db
    .select({
      path: t.symbols.path,
      name: t.symbols.name,
      exported: t.symbols.exported,
      signature: t.symbols.signature,
      rank: t.fileRank.rank,
    })
    .from(t.symbols)
    .innerJoin(
      t.fileRank,
      and(eq(t.fileRank.repoId, t.symbols.repoId), eq(t.fileRank.filePath, t.symbols.path)),
    )
    .where(and(eq(t.symbols.repoId, repoId), isNotNull(t.symbols.signature)))
    .orderBy(
      desc(t.fileRank.rank),
      desc(t.symbols.exported),
      asc(t.symbols.line),
      asc(t.symbols.name),
    );
}

/** Repo-map cache read by PK. */
export async function getRepoMapCache(
  db: Db,
  repoId: string,
  commitSha: string,
  tokenBudget: number,
): Promise<{ mapText: string; tokenCount: number } | null> {
  const [row] = await db
    .select({ mapText: t.repoMapCache.mapText, tokenCount: t.repoMapCache.tokenCount })
    .from(t.repoMapCache)
    .where(
      and(
        eq(t.repoMapCache.repoId, repoId),
        eq(t.repoMapCache.commitSha, commitSha),
        eq(t.repoMapCache.tokenBudget, tokenBudget),
      ),
    );
  return row ?? null;
}

/** Repo-map cache upsert by (repoId, commitSha, tokenBudget). */
export async function putRepoMapCache(
  db: Db,
  repoId: string,
  commitSha: string,
  tokenBudget: number,
  mapText: string,
  tokenCount: number,
): Promise<void> {
  await db
    .insert(t.repoMapCache)
    .values({ repoId, commitSha, tokenBudget, mapText, tokenCount })
    .onConflictDoUpdate({
      target: [t.repoMapCache.repoId, t.repoMapCache.commitSha, t.repoMapCache.tokenBudget],
      set: { mapText, tokenCount, createdAt: new Date() },
    });
}

/** Drop the whole repo-map cache for a repo (SHA moved / repo reindex). */
export async function deleteRepoMapCache(db: Db, repoId: string): Promise<void> {
  await db.delete(t.repoMapCache).where(eq(t.repoMapCache.repoId, repoId));
}
