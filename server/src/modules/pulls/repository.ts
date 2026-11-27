import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PrMeta, PrDetail } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { RunCostRow } from './cost.js';
import type { DiffStats, PullRecord, PullRepo, PullsRepositoryPort } from './types.js';

/**
 * F1 — pulls data-access layer. The ONLY place that touches `pull_requests`,
 * `pr_files` and `pr_commits` (plus the read-only review/run lookups the PR
 * list needs). Every entry point is scoped by `workspaceId` (tenancy guard).
 */

type PrRow = typeof t.pullRequests.$inferSelect;

/** Columns that make up a PullRecord (everything but `body`/`workspaceId`). */
const PULL_RECORD_COLUMNS = {
  id: t.pullRequests.id,
  repoId: t.pullRequests.repoId,
  number: t.pullRequests.number,
  title: t.pullRequests.title,
  author: t.pullRequests.author,
  branch: t.pullRequests.branch,
  base: t.pullRequests.base,
  headSha: t.pullRequests.headSha,
  lastReviewedSha: t.pullRequests.lastReviewedSha,
  additions: t.pullRequests.additions,
  deletions: t.pullRequests.deletions,
  filesCount: t.pullRequests.filesCount,
  status: t.pullRequests.status,
  openedAt: t.pullRequests.openedAt,
  updatedAt: t.pullRequests.updatedAt,
};

export class PullsRepository implements PullsRepositoryPort {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<PullRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async getById(workspaceId: string, id: string): Promise<PullRecord | undefined> {
    const [row] = await this.db
      .select(PULL_RECORD_COLUMNS)
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    return row;
  }

  async getByNumber(
    workspaceId: string,
    repoId: string,
    number: number,
  ): Promise<PullRecord | undefined> {
    const [row] = await this.db
      .select(PULL_RECORD_COLUMNS)
      .from(t.pullRequests)
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.pullRequests.number, number),
        ),
      );
    return row;
  }

  async listByRepo(repoId: string): Promise<PullRecord[]> {
    return this.db
      .select(PULL_RECORD_COLUMNS)
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repoId));
  }

  /**
   * Idempotent import of GitHub's PR list — ONE multi-row upsert on the
   * (repo_id, number) unique index. Existing rows only get the fields GitHub's
   * list payload is authoritative for; diff stats/body are left alone (they
   * come from the detail endpoint).
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

  async updateDiffStats(prId: string, stats: DiffStats): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, prId));
  }

  /**
   * Replace a PR's files + commits and refresh body/diff stats from a GitHub
   * detail payload — atomically, so a failure mid-way never leaves a PR with
   * its files deleted but not re-inserted.
   */
  async replaceDetail(prId: string, detail: PrDetail): Promise<void> {
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
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, prId));
    });
  }

  async getPersistedDetail(prId: string): Promise<PrDetail | undefined> {
    const [pr] = await this.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, prId));
    if (!pr) return undefined;
    const [files, commits] = await Promise.all([
      this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId)),
      this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId)),
    ]);
    return toPrDetail(pr, files, commits);
  }

  /** Review scores for the given PRs, newest first (caller keeps the first per PR). */
  async reviewScoresNewestFirst(prIds: string[]): Promise<{ prId: string; score: number | null }[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  /** Agent-run costs for the given PRs, newest first (input to latestRoundCost). */
  async runCostsNewestFirst(prIds: string[]): Promise<RunCostRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.agentRuns.prId, agentId: t.agentRuns.agentId, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.prId, prIds))
      .orderBy(desc(t.agentRuns.ranAt));
  }
}

/** Row → contract mapper for the persisted (offline) PR detail. */
function toPrDetail(
  pr: PrRow,
  files: (typeof t.prFiles.$inferSelect)[],
  commits: (typeof t.prCommits.$inferSelect)[],
): PrDetail {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: pr.status as PrDetail['status'],
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    body: pr.body ?? null,
    files: files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committed_at: c.committedAt?.toISOString() ?? null,
    })),
  };
}
