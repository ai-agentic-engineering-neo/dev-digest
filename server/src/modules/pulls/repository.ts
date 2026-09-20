import { and, desc, eq, inArray } from 'drizzle-orm';
import type { PrFile, PrCommit, PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  PullsRepo,
  RepoRef,
  PullRecord,
  PrFileRecord,
  PrCommitRecord,
  ReviewRollupRow,
  FindingSeverityRow,
  RunCostRow,
} from './types.js';

/**
 * Pulls module data access (ring 4) — the ONLY file touching Drizzle/db schema
 * for pull requests, their files/commits, and the cross-aggregate rollups the
 * pulls list needs (reviews + findings + agent_runs). Row → domain mapping
 * happens here via named mappers; callers never see a Drizzle row.
 */

function toRepoRef(row: typeof t.repos.$inferSelect): RepoRef {
  return { id: row.id, workspaceId: row.workspaceId, owner: row.owner, name: row.name };
}

function toPullRecord(row: typeof t.pullRequests.$inferSelect): PullRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
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

function toPrFileRecord(row: typeof t.prFiles.$inferSelect): PrFileRecord {
  return { path: row.path, additions: row.additions, deletions: row.deletions, patch: row.patch };
}

function toPrCommitRecord(row: typeof t.prCommits.$inferSelect): PrCommitRecord {
  return { sha: row.sha, message: row.message, author: row.author, committedAt: row.committedAt };
}

export class PullsRepository implements PullsRepo {
  constructor(private db: Db) {}

  async getRepoForWorkspace(workspaceId: string, repoId: string): Promise<RepoRef | undefined> {
    const [repo] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return repo ? toRepoRef(repo) : undefined;
  }

  async getRepoById(repoId: string): Promise<RepoRef | undefined> {
    const [repo] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return repo ? toRepoRef(repo) : undefined;
  }

  async upsertPullRequestFromList(
    workspaceId: string,
    repoId: string,
    pr: PrMeta,
    opts?: { setOpenedAt?: boolean },
  ): Promise<void> {
    const setOpenedAt = opts?.setOpenedAt ?? true;
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
        ...(setOpenedAt ? { openedAt: pr.opened_at ? new Date(pr.opened_at) : null } : {}),
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

  async listPullsForRepo(repoId: string): Promise<PullRecord[]> {
    const rows = await this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
    return rows.map(toPullRecord);
  }

  async updatePullDiffStats(
    pullId: string,
    stats: { additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ additions: stats.additions, deletions: stats.deletions, filesCount: stats.filesCount })
      .where(eq(t.pullRequests.id, pullId));
  }

  async reviewRollupForPulls(prIds: string[]): Promise<ReviewRollupRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({
        id: t.reviews.id,
        prId: t.reviews.prId,
        agentId: t.reviews.agentId,
        score: t.reviews.score,
        verdict: t.reviews.verdict,
      })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  async findingSeveritiesForReviewIds(reviewIds: string[]): Promise<FindingSeverityRow[]> {
    if (reviewIds.length === 0) return [];
    return this.db
      .select({ prId: t.reviews.prId, severity: t.findings.severity })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(inArray(t.reviews.id, reviewIds));
  }

  async completedRunCostsForPulls(prIds: string[]): Promise<RunCostRow[]> {
    if (prIds.length === 0) return [];
    const rows = await this.db
      .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.status, 'done')));
    return rows
      .filter((r): r is { prId: string; costUsd: number | null } => r.prId != null)
      .map((r) => ({ prId: r.prId, costUsd: r.costUsd }));
  }

  async getPullForWorkspace(workspaceId: string, pullId: string): Promise<PullRecord | undefined> {
    const [pr] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, pullId)));
    return pr ? toPullRecord(pr) : undefined;
  }

  async replacePrFilesAndCommits(pullId: string, files: PrFile[], commits: PrCommit[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, pullId));
      if (files.length > 0) {
        await tx.insert(t.prFiles).values(
          files.map((f) => ({
            prId: pullId,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, pullId));
      if (commits.length > 0) {
        await tx.insert(t.prCommits).values(
          commits.map((c) => ({
            prId: pullId,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
    });
  }

  async updatePullDetail(
    pullId: string,
    fields: { body: string | null; additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({
        body: fields.body,
        additions: fields.additions,
        deletions: fields.deletions,
        filesCount: fields.filesCount,
      })
      .where(eq(t.pullRequests.id, pullId));
  }

  async getPrFilesAndCommits(
    pullId: string,
  ): Promise<{ files: PrFileRecord[]; commits: PrCommitRecord[] }> {
    const [files, commits] = await Promise.all([
      this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pullId)),
      this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, pullId)),
    ]);
    return { files: files.map(toPrFileRecord), commits: commits.map(toPrCommitRecord) };
  }

  async touchRepoPolledAt(repoId: string): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: new Date() }).where(eq(t.repos.id, repoId));
  }
}
