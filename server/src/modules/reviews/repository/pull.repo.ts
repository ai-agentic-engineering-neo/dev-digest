import { and, eq } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

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

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
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

// ---- intent ---------------------------------------------------------------

/** Metadata about the LLM call that produced an `Intent`, persisted alongside it. */
export type IntentMeta = {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  computedAt: Date;
};

/** `Intent` plus the persisted call metadata — `getIntent`'s return shape. */
export type IntentRecord = Intent & {
  computed_at: Date;
  provider: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
};

export async function upsertIntent(
  db: Db,
  prId: string,
  intent: Intent,
  meta: IntentMeta,
): Promise<void> {
  const columns = {
    summary: intent.summary,
    inScope: intent.in_scope,
    outOfScope: intent.out_of_scope,
    computedAt: meta.computedAt,
    provider: meta.provider,
    model: meta.model,
    tokensIn: meta.tokensIn,
    tokensOut: meta.tokensOut,
    costUsd: meta.costUsd,
  };
  await db
    .insert(t.prIntent)
    .values({ prId, ...columns })
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: columns,
    });
}

export async function getIntent(db: Db, prId: string): Promise<IntentRecord | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    summary: row.summary,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    computed_at: row.computedAt,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
  };
}
