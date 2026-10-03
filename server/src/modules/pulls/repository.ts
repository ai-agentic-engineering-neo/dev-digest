import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PrMeta, PrFile, PrCommit } from '@devdigest/shared';

/**
 * F1 — pulls data-access. The ONLY layer touching the DB for the pull-request
 * domain: `pull_requests`, `pr_files`, `pr_commits`, plus the read-only
 * aggregation queries the PR list rolls up from `reviews`/`findings`/`agent_runs`.
 */

import type { PullRow } from '../../db/rows.js';
export type { PullRow };

export type RepoRow = typeof t.repos.$inferSelect;

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

export interface PrDetailPatch extends DiffStats {
  body: string | null;
}

/** Raw row for the PR-list SCORE ring: the latest review per PR. */
export interface ReviewScoreRow {
  id: string;
  prId: string;
  score: number | null;
}

/** Raw row for the FINDINGS per-agent-latest rollup. */
export interface ReviewAgentRow {
  id: string;
  prId: string;
  agentId: string | null;
  createdAt: Date | null;
}

export interface SeverityCountRow {
  prId: string;
  severity: string;
  count: number;
}

export interface RunCostRow {
  prId: string | null;
  costUsd: number | null;
}

export class PullsRepository {
  constructor(private db: Db) {}

  // ---- repo lookup ----------------------------------------------------

  async findRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Look up a repo by id with no workspace scope — used once the PR row
   *  (already workspace-scoped) has resolved its repo_id. */
  async getRepoById(repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  // ---- pull_requests ----------------------------------------------------

  async getById(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async listByRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  /**
   * Idempotent batched upsert of a repo's PR list from GitHub (unique on
   * repo_id+number). ONE insert().onConflictDoUpdate() call for the whole
   * page rather than one round-trip per PR.
   */
  async upsertFromGitHub(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void> {
    if (pulls.length === 0) return;
    await this.db
      .insert(t.pullRequests)
      .values(
        pulls.map((pr) => ({
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
        })),
      )
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: sql`excluded.title`,
          headSha: sql`excluded.head_sha`,
          status: sql`excluded.status`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  /** Backfill diff stats for one PR (from the GitHub detail endpoint — diff
   *  stats aren't on the list payload). Necessarily one row at a time: each
   *  call is paired with its own external GitHub detail fetch. */
  async updateDiffStats(id: string, stats: DiffStats): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ additions: stats.additions, deletions: stats.deletions, filesCount: stats.filesCount })
      .where(eq(t.pullRequests.id, id));
  }

  async updateDetail(id: string, patch: PrDetailPatch): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        body: patch.body,
        additions: patch.additions,
        deletions: patch.deletions,
        filesCount: patch.filesCount,
      })
      .where(eq(t.pullRequests.id, id));
  }

  // ---- pr_files / pr_commits (refreshed wholesale on each detail fetch) ---

  async replacePrFiles(prId: string, files: PrFile[]): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (files.length === 0) return;
    await this.db.insert(t.prFiles).values(
      files.map((f) => ({
        prId,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
    );
  }

  async replacePrCommits(prId: string, commits: PrCommit[]): Promise<void> {
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (commits.length === 0) return;
    await this.db.insert(t.prCommits).values(
      commits.map((c) => ({
        prId,
        sha: c.sha,
        message: c.message,
        author: c.author,
        committedAt: c.committed_at ? new Date(c.committed_at) : null,
      })),
    );
  }

  async listPrFiles(prId: string): Promise<(typeof t.prFiles.$inferSelect)[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async listPrCommits(prId: string): Promise<(typeof t.prCommits.$inferSelect)[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
  }

  // ---- PR-list aggregates (score / findings / cost rollups) --------------

  /** Every 'review'-kind review for these PRs, newest first — for the SCORE
   *  ring ("latest review wins", no per-agent grouping). */
  async latestReviewRowsForPrs(prIds: string[]): Promise<ReviewScoreRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ id: t.reviews.id, prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  /** Every 'review'-kind review row (id/prId/agentId/createdAt) for the
   *  FINDINGS per-distinct-agent-latest rollup. */
  async reviewAgentRowsForPrs(prIds: string[]): Promise<ReviewAgentRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({
        id: t.reviews.id,
        prId: t.reviews.prId,
        agentId: t.reviews.agentId,
        createdAt: t.reviews.createdAt,
      })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')));
  }

  async findingsCountsForReviewIds(reviewIds: string[]): Promise<SeverityCountRow[]> {
    if (reviewIds.length === 0) return [];
    return this.db
      .select({
        prId: t.reviews.prId,
        severity: t.findings.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(inArray(t.findings.reviewId, reviewIds))
      .groupBy(t.reviews.prId, t.findings.severity);
  }

  /** Sum of every 'done' run's cost per PR (no per-agent dedup — money
   *  already spent) — for the COST column. */
  async runCostRowsForPrs(prIds: string[]): Promise<RunCostRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.status, 'done')));
  }
}
