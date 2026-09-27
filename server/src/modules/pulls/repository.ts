import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { PrDetail, PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SummarizableFinding } from './findings-summary.js';

/**
 * F1 — pulls data-access layer. The ONLY place that touches `pull_requests`,
 * `pr_files` and `pr_commits`, plus the PR-list READ MODEL (see
 * `docs/pr-list-read-model.md`): one IN-query per derived column over
 * `reviews` / `findings` / `agent_runs`, grouped in JS.
 *
 * Rows are mapped at this edge — `$inferSelect` does not leave this file.
 */

/** A pull request as the rest of the module sees it: camelCase, no columns. */
export interface PullRecord {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  openedAt: Date | null;
  updatedAt: Date | null;
  lastReviewedSha: string | null;
  body: string | null;
}

export interface PrFileRecord {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PrCommitRecord {
  sha: string;
  message: string;
  author: string;
  committedAt: Date | null;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

/**
 * The derived columns of the PR list, keyed by PR id. Findings come back RAW —
 * summarising and scoring them is a rule, and rules live in the service.
 */
export interface PullListReadModel {
  openFindingsByPr: Map<string, SummarizableFinding[]>;
  costByPr: Map<string, number>;
}

const toPull = (r: typeof t.pullRequests.$inferSelect): PullRecord => ({
  id: r.id,
  repoId: r.repoId,
  number: r.number,
  title: r.title,
  author: r.author,
  branch: r.branch,
  base: r.base,
  headSha: r.headSha,
  additions: r.additions,
  deletions: r.deletions,
  filesCount: r.filesCount,
  status: r.status,
  openedAt: r.openedAt,
  updatedAt: r.updatedAt,
  lastReviewedSha: r.lastReviewedSha,
  body: r.body,
});

export class PullsRepository {
  constructor(private db: Db) {}

  async listForRepo(repoId: string): Promise<PullRecord[]> {
    const rows = await this.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repoId));
    return rows.map(toPull);
  }

  async getById(workspaceId: string, prId: string): Promise<PullRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row ? toPull(row) : undefined;
  }

  /**
   * Idempotent import of one PR from GitHub (unique repo_id+number). `openedAt`
   * is only written on insert — GitHub's list payload does not resend it.
   */
  async upsertFromGitHub(
    workspaceId: string,
    repoId: string,
    pr: PrMeta,
    opts: { withOpenedAt?: boolean } = {},
  ): Promise<void> {
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
        ...(opts.withOpenedAt
          ? { openedAt: pr.opened_at ? new Date(pr.opened_at) : null }
          : {}),
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

  async updateDiffStats(prId: string, stats: DiffStats): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        additions: stats.additions,
        deletions: stats.deletions,
        filesCount: stats.filesCount,
      })
      .where(eq(t.pullRequests.id, prId));
  }

  async updateDetail(prId: string, body: string | null, stats: DiffStats): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        body,
        additions: stats.additions,
        deletions: stats.deletions,
        filesCount: stats.filesCount,
      })
      .where(eq(t.pullRequests.id, prId));
  }

  async replaceFiles(prId: string, files: PrDetail['files']): Promise<void> {
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

  async replaceCommits(prId: string, commits: PrDetail['commits']): Promise<void> {
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

  async listFiles(prId: string): Promise<PrFileRecord[]> {
    const rows = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    }));
  }

  async listCommits(prId: string): Promise<PrCommitRecord[]> {
    const rows = await this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
    return rows.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committedAt: c.committedAt,
    }));
  }

  /**
   * PR-list derived columns in two IN-queries.
   *
   * Findings: the CURRENT opinion of every agent — the newest review per
   * (PR, agent), newest first, first row per pair wins. Not "all reviews":
   * findings are never deduplicated between runs, so a re-run would count the
   * same problem twice. Not "the single newest review" either: a "Run all
   * agents" batch writes one review per agent, so the others would vanish.
   * Dismissed findings are excluded. A reviewed PR with nothing open still gets
   * an empty bucket — "clean" is not the same as "never reviewed".
   *
   * Cost: the TOTAL of every run ever made against the PR. A PR whose runs are
   * all unpriced stays absent from the map, so it reports null, not $0.00.
   */
  async readModelFor(prIds: string[]): Promise<PullListReadModel> {
    const openFindingsByPr = new Map<string, SummarizableFinding[]>();
    const costByPr = new Map<string, number>();
    if (prIds.length === 0) return { openFindingsByPr, costByPr };

    const reviewRows = await this.db
      .select({ id: t.reviews.id, prId: t.reviews.prId, agentId: t.reviews.agentId })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt), desc(t.reviews.id));

    const prIdByReview = new Map<string, string>();
    const seen = new Set<string>();
    for (const rv of reviewRows) {
      if (!openFindingsByPr.has(rv.prId)) openFindingsByPr.set(rv.prId, []);
      // A review with no agent cannot be superseded by identity, so it keys on
      // itself and stands on its own.
      const key = `${rv.prId}:${rv.agentId ?? rv.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      prIdByReview.set(rv.id, rv.prId);
    }

    const reviewIds = [...prIdByReview.keys()];
    if (reviewIds.length > 0) {
      const findingRows = await this.db
        .select({
          id: t.findings.id,
          reviewId: t.findings.reviewId,
          severity: t.findings.severity,
          category: t.findings.category,
          title: t.findings.title,
          file: t.findings.file,
          startLine: t.findings.startLine,
          endLine: t.findings.endLine,
          confidence: t.findings.confidence,
          rationale: t.findings.rationale,
        })
        .from(t.findings)
        .where(and(inArray(t.findings.reviewId, reviewIds), isNull(t.findings.dismissedAt)));
      for (const f of findingRows) {
        const prId = prIdByReview.get(f.reviewId);
        if (!prId) continue;
        openFindingsByPr.get(prId)?.push(f);
      }
    }

    const runRows = await this.db
      .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.prId, prIds));
    for (const run of runRows) {
      if (!run.prId || run.costUsd == null) continue;
      costByPr.set(run.prId, (costByPr.get(run.prId) ?? 0) + run.costUsd);
    }

    return { openFindingsByPr, costByPr };
  }
}
