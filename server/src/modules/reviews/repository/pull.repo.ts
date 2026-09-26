import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { PrCommitRow, PrFileRow, PullRow, RepoRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(db: Db, repoId: string): Promise<RepoRow | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(db: Db, prId: string): Promise<PrFileRow[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/** A PR's commits, oldest first — the intent layer (L03) reads commit
 *  subjects as a low-priority signal. */
export async function getPrCommits(db: Db, prId: string): Promise<PrCommitRow[]> {
  return db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId)).orderBy(asc(t.prCommits.committedAt));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}
