import { and, count, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { PrCommit, PrFile, PrMeta } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import type { DbOrTx } from '../../db/client.js';
import type { DiffStats, FindingsCounts, PullRecord, PullRollup, RepoCoords } from './domain.js';

type PullRow = typeof t.pullRequests.$inferSelect;

function toPullRecord(r: PullRow): PullRecord {
  return {
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
    body: r.body ?? null,
    lastReviewedSha: r.lastReviewedSha,
    openedAt: r.openedAt,
    updatedAt: r.updatedAt,
  };
}

const repoCoords = { id: t.repos.id, owner: t.repos.owner, name: t.repos.name };

/**
 * Pulls persistence (infrastructure): PR rows, their mirrored files/commits and
 * the review/cost rollups the PR list shows. Built on `db` or a transaction
 * handle — the use case (PullsService) decides the transaction boundary.
 */
export class PullsRepository {
  constructor(private readonly db: DbOrTx) {}

  async findRepo(workspaceId: string, repoId: string): Promise<RepoCoords | null> {
    const [repo] = await this.db
      .select(repoCoords)
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return repo ?? null;
  }

  async findRepoById(repoId: string): Promise<RepoCoords | null> {
    const [repo] = await this.db.select(repoCoords).from(t.repos).where(eq(t.repos.id, repoId));
    return repo ?? null;
  }

  async findPull(workspaceId: string, prId: string): Promise<PullRecord | null> {
    const [pr] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return pr ? toPullRecord(pr) : null;
  }

  async listForRepo(repoId: string): Promise<PullRecord[]> {
    const rows = await this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
    return rows.map(toPullRecord);
  }

  /**
   * One multi-row upsert of GitHub's PR-list payload (atomic as a single
   * statement). On conflict only the fields the list payload is authoritative
   * for are refreshed; diff stats are backfilled from the detail endpoint.
   */
  async upsertListed(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void> {
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

  async setDiffStats(prId: string, stats: DiffStats): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ additions: stats.additions, deletions: stats.deletions, filesCount: stats.filesCount })
      .where(eq(t.pullRequests.id, prId));
  }

  /** Detail fields GitHub's detail payload is authoritative for (body + diff stats). */
  async setDetailFields(prId: string, fields: DiffStats & { body: string | null }): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        body: fields.body,
        additions: fields.additions,
        deletions: fields.deletions,
        filesCount: fields.filesCount,
      })
      .where(eq(t.pullRequests.id, prId));
  }

  /** Mirror GitHub's file list: upsert what it returned, drop what it no longer has. */
  async replaceFiles(prId: string, files: PrFile[]): Promise<void> {
    const paths = files.map((f) => f.path);
    await this.db
      .delete(t.prFiles)
      .where(
        paths.length > 0
          ? and(eq(t.prFiles.prId, prId), notInArray(t.prFiles.path, paths))
          : eq(t.prFiles.prId, prId),
      );
    if (files.length === 0) return;
    await this.db
      .insert(t.prFiles)
      .values(
        files.map((f) => ({
          prId,
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [t.prFiles.prId, t.prFiles.path],
        set: {
          additions: sql`excluded.additions`,
          deletions: sql`excluded.deletions`,
          patch: sql`excluded.patch`,
        },
      });
  }

  /** Mirror GitHub's commit list: upsert what it returned, drop what it no longer has. */
  async replaceCommits(prId: string, commits: PrCommit[]): Promise<void> {
    const shas = commits.map((c) => c.sha);
    await this.db
      .delete(t.prCommits)
      .where(
        shas.length > 0
          ? and(eq(t.prCommits.prId, prId), notInArray(t.prCommits.sha, shas))
          : eq(t.prCommits.prId, prId),
      );
    if (commits.length === 0) return;
    await this.db
      .insert(t.prCommits)
      .values(
        commits.map((c) => ({
          prId,
          sha: c.sha,
          message: c.message,
          author: c.author,
          committedAt: c.committed_at ? new Date(c.committed_at) : null,
        })),
      )
      .onConflictDoUpdate({
        target: [t.prCommits.prId, t.prCommits.sha],
        set: {
          message: sql`excluded.message`,
          author: sql`excluded.author`,
          committedAt: sql`excluded.committed_at`,
        },
      });
  }

  async listFiles(prId: string): Promise<PrFile[]> {
    const rows = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    }));
  }

  async listCommits(prId: string): Promise<PrCommit[]> {
    const rows = await this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
    return rows.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committed_at: c.committedAt?.toISOString() ?? null,
    }));
  }

  /**
   * List rollups per PR, computed on read (no FK denorm; the list is small, so
   * IN-queries + grouping are cheap):
   *  - the latest review (`kind='review'`): its score and findings per severity;
   *  - total USD cost = SUM over ALL the PR's runs (any status, local + ci).
   *    SUM skips NULL (unpriced runs) and is NULL only when no run has a cost.
   */
  async rollups(workspaceId: string, prIds: string[]): Promise<Map<string, PullRollup>> {
    const out = new Map<string, PullRollup>();
    if (prIds.length === 0) return out;

    const reviewRows = await this.db
      .select({ id: t.reviews.id, prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
    const latestByPr = new Map<string, { id: string; score: number | null }>();
    // Rows are newest-first → the first seen per PR is the latest review.
    for (const rv of reviewRows) {
      if (!latestByPr.has(rv.prId)) latestByPr.set(rv.prId, { id: rv.id, score: rv.score });
    }

    const countsByReview = new Map<string, FindingsCounts>();
    const latestIds = [...latestByPr.values()].map((rv) => rv.id);
    for (const id of latestIds) countsByReview.set(id, { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    if (latestIds.length > 0) {
      const countRows = await this.db
        .select({ reviewId: t.findings.reviewId, severity: t.findings.severity, n: count() })
        .from(t.findings)
        .where(inArray(t.findings.reviewId, latestIds))
        .groupBy(t.findings.reviewId, t.findings.severity);
      for (const c of countRows) {
        const counts = countsByReview.get(c.reviewId);
        if (counts && c.severity in counts) counts[c.severity as keyof FindingsCounts] = Number(c.n);
      }
    }

    const costRows = await this.db
      .select({ prId: t.agentRuns.prId, total: sql<number | null>`sum(${t.agentRuns.costUsd})` })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.agentRuns.prId, prIds)))
      .groupBy(t.agentRuns.prId);
    const costByPr = new Map<string, number | null>();
    for (const c of costRows) {
      // pg may hand the aggregate back as a string — normalise to number.
      if (c.prId) costByPr.set(c.prId, c.total == null ? null : Number(c.total));
    }

    for (const prId of prIds) {
      const review = latestByPr.get(prId);
      out.set(prId, {
        latestReviewId: review?.id ?? null,
        score: review ? review.score : null,
        findingsCounts: review ? (countsByReview.get(review.id) ?? null) : null,
        costUsd: costByPr.get(prId) ?? null,
      });
    }
    return out;
  }
}
