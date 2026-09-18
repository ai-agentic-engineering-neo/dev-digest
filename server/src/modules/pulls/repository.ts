import { and, desc, eq, inArray } from 'drizzle-orm';
import type { PrMeta, PrDetail } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow, RepoRow, FindingRow } from '../../db/rows.js';
import type { ReviewBatchRow } from './latest-batch-reviews.js';

export type PrFileRow = typeof t.prFiles.$inferSelect;
export type PrCommitRow = typeof t.prCommits.$inferSelect;

/** Raw cost row as Drizzle returns it (costUsd is a numeric column → string).
 *  Named distinctly from total-cost.ts's `AgentRunCostRow`, which is the same
 *  shape AFTER the numeric→number conversion the service does before summing. */
export interface RawCostRow {
  prId: string | null;
  status: string | null;
  costUsd: string | null;
}

/**
 * F1 — pulls data-access. The ONLY place in this module that touches the DB.
 * Every by-id lookup that crosses a tenancy boundary is workspace-scoped.
 */
export class PullsRepository {
  constructor(private db: Db) {}

  getRepoInWorkspace(workspaceId: string, id: string): Promise<RepoRow | undefined> {
    return this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)))
      .then((rows) => rows[0]);
  }

  getRepoById(id: string): Promise<RepoRow | undefined> {
    return this.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.id, id))
      .then((rows) => rows[0]);
  }

  getPullInWorkspace(workspaceId: string, id: string): Promise<PullRow | undefined> {
    return this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)))
      .then((rows) => rows[0]);
  }

  listForRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  /** Idempotent upsert of every listed PR (unique repo_id+number). */
  async upsertFromCodeHost(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void> {
    for (const pr of pulls) {
      await this.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId,
          number: pr.number,
          title: pr.title,
          author: pr.author,
          branch: pr.branch,
          base: pr.base,
          headSha: pr.head_sha,
          additions: pr.additions,
          deletions: pr.deletions,
          filesCount: pr.files_count,
          status: pr.status,
          openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        })
        .onConflictDoUpdate({
          target: [t.pullRequests.repoId, t.pullRequests.number],
          set: {
            title: pr.title,
            headSha: pr.head_sha,
            status: pr.status,
            updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
          },
        });
    }
  }

  /** Backfill diff stats for one PR (list payload doesn't carry them). */
  async backfillStats(
    id: string,
    stats: { additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        additions: stats.additions,
        deletions: stats.deletions,
        filesCount: stats.filesCount,
      })
      .where(eq(t.pullRequests.id, id));
  }

  /** Every `kind='review'` row for these PRs, newest first — grouped into
   *  latest-batches by latestBatchReviewsByPr() (latest-batch-reviews.ts). */
  async latestBatchReviewRows(prIds: string[]): Promise<ReviewBatchRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({
        id: t.reviews.id,
        prId: t.reviews.prId,
        score: t.reviews.score,
        runId: t.reviews.runId,
        batchId: t.agentRuns.batchId,
      })
      .from(t.reviews)
      .leftJoin(t.agentRuns, eq(t.reviews.runId, t.agentRuns.id))
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  async findingsForReviews(reviewIds: string[]): Promise<FindingRow[]> {
    if (reviewIds.length === 0) return [];
    return this.db.select().from(t.findings).where(inArray(t.findings.reviewId, reviewIds));
  }

  /** Raw cost rows for totalCostByPr() (total-cost.ts) — costUsd is a numeric
   *  column, so Drizzle returns it as a string; the caller converts. */
  async costRows(prIds: string[]): Promise<RawCostRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({
        prId: t.agentRuns.prId,
        status: t.agentRuns.status,
        costUsd: t.agentRuns.costUsd,
      })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.prId, prIds));
  }

  getPrFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  getPrCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  /**
   * Replace a PR's files/commits with a freshly-fetched detail + backfill its
   * body/diff-stats — one transaction, so a crash between the delete and the
   * insert can't leave the PR with zero persisted files/commits.
   */
  async refreshDetail(prId: string, detail: PrDetail): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (detail.files.length > 0) {
        await tx.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
      if (detail.commits.length > 0) {
        await tx.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await tx
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          // Diff stats aren't on GitHub's PR-list payload — backfill them from
          // the detail fetch so the Pull Requests list shows real size/files.
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, prId));
    });
  }
}
