import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PrCommit, PrFile, PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Pulls data-access. The only place in this module that imports Drizzle.
 * Every read that can take a workspace takes one, so a caller can't forget it.
 */

export interface StoredRepo {
  id: string;
  owner: string;
  name: string;
}

export interface StoredPull {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  lastReviewedSha: string | null;
  additions: number;
  deletions: number;
  filesCount: number;
  /** GitHub merge state (open/merged/closed), not the derived review status. */
  status: string;
  body: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

type PullRow = typeof t.pullRequests.$inferSelect;

function toStoredPull(row: PullRow): StoredPull {
  return {
    id: row.id,
    repoId: row.repoId,
    number: row.number,
    title: row.title,
    author: row.author,
    branch: row.branch,
    base: row.base,
    headSha: row.headSha,
    lastReviewedSha: row.lastReviewedSha,
    additions: row.additions,
    deletions: row.deletions,
    filesCount: row.filesCount,
    status: row.status,
    body: row.body,
    openedAt: row.openedAt,
    updatedAt: row.updatedAt,
  };
}

export class PullRepository {
  constructor(private db: Db) {}

  async findRepo(workspaceId: string, id: string): Promise<StoredRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row;
  }

  /**
   * Idempotent import (unique repo_id+number). Conflict updates the fields
   * GitHub's list payload is authoritative for, and leaves diff stats and
   * opened_at alone — those are filled by the detail backfill.
   */
  async upsertFromList(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void> {
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

  async listByRepo(workspaceId: string, repoId: string): Promise<StoredPull[]> {
    const rows = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.repoId, repoId)));
    return rows.map(toStoredPull);
  }

  async updateDiffStats(
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

  /** Newest review score per PR. First row wins because the query is newest-first. */
  async latestReviewScoreByPr(
    workspaceId: string,
    prIds: string[],
  ): Promise<Map<string, number | null>> {
    const scores = new Map<string, number | null>();
    if (prIds.length === 0) return scores;
    const rows = await this.db
      .select({ prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(
        and(
          inArray(t.reviews.prId, prIds),
          eq(t.reviews.kind, 'review'),
          eq(t.reviews.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(t.reviews.createdAt));
    for (const row of rows) {
      if (!scores.has(row.prId)) scores.set(row.prId, row.score);
    }
    return scores;
  }

  /**
   * Sum of stored run cost per PR. SQL SUM skips nulls and yields null when
   * no run is priced — the list renders that as "—", not $0.
   */
  async sumCostByPr(workspaceId: string, prIds: string[]): Promise<Map<string, number | null>> {
    const costs = new Map<string, number | null>();
    if (prIds.length === 0) return costs;
    const rows = await this.db
      .select({
        prId: t.agentRuns.prId,
        total: sql<number | null>`sum(${t.agentRuns.costUsd})`.mapWith((v) =>
          v == null ? null : Number(v),
        ),
      })
      .from(t.agentRuns)
      .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.workspaceId, workspaceId)))
      .groupBy(t.agentRuns.prId);
    for (const row of rows) if (row.prId) costs.set(row.prId, row.total);
    return costs;
  }

  async findPull(workspaceId: string, id: string): Promise<StoredPull | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    return row ? toStoredPull(row) : undefined;
  }

  async replaceFiles(prId: string, files: PrFile[]): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (files.length === 0) return;
    await this.db.insert(t.prFiles).values(
      files.map((file) => ({
        prId,
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch ?? null,
      })),
    );
  }

  async replaceCommits(prId: string, commits: PrCommit[]): Promise<void> {
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (commits.length === 0) return;
    await this.db.insert(t.prCommits).values(
      commits.map((commit) => ({
        prId,
        sha: commit.sha,
        message: commit.message,
        author: commit.author,
        committedAt: commit.committed_at ? new Date(commit.committed_at) : null,
      })),
    );
  }

  async updateDetail(
    prId: string,
    detail: { body: string | null; additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        body: detail.body,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.filesCount,
      })
      .where(eq(t.pullRequests.id, prId));
  }

  async listFiles(prId: string): Promise<PrFile[]> {
    const rows = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((file) => ({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch ?? null,
    }));
  }

  async listCommits(prId: string): Promise<PrCommit[]> {
    const rows = await this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
    return rows.map((commit) => ({
      sha: commit.sha,
      message: commit.message,
      author: commit.author,
      committed_at: commit.committedAt?.toISOString() ?? null,
    }));
  }
}
