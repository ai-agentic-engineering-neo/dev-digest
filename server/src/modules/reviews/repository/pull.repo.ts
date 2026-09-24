import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { UnifiedDiff } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';
import { parseUnifiedDiff } from '../../../adapters/git/diff-parser.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: DbOrTx,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: DbOrTx,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

/** Reconstruct a PR's UnifiedDiff from its persisted pr_files patches. */
export async function storedDiff(db: DbOrTx, prId: string): Promise<UnifiedDiff> {
  const files = await db
    .select({ path: t.prFiles.path, patch: t.prFiles.patch })
    .from(t.prFiles)
    .where(eq(t.prFiles.prId, prId));
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`, `--- a/${f.path}`, `+++ b/${f.path}`, f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: DbOrTx, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// Intent read/write now lives in modules/intent (server/specs/05-intent-layer.md);
// these were unused (never seeded, never called — see server/INSIGHTS.md
// "Verified facts") and incompatible with the expanded pr_intent columns.
