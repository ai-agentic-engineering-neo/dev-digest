import { and, desc, eq, inArray } from 'drizzle-orm';
import type { PrDetail, PrMeta } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import type { PullRow } from '../../../db/rows.js';
import * as t from '../../../db/schema.js';
import type { RunCostRow } from '../domain/cost.js';
import type { PullsRepository } from '../domain/ports.js';
import type { DiffStats, PullRepo, StoredPull } from '../domain/types.js';

function toStoredPull(r: PullRow): StoredPull {
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
    ghStatus: r.status,
    openedAt: r.openedAt,
    updatedAt: r.updatedAt,
    lastReviewedSha: r.lastReviewedSha,
    body: r.body,
  };
}

const iso = (d: string | null | undefined) => (d ? new Date(d) : null);

export class DrizzlePullsRepository implements PullsRepository {
  constructor(private readonly db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<PullRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async repoOf(pull: StoredPull): Promise<PullRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(eq(t.repos.id, pull.repoId));
    return row;
  }

  async findPull(workspaceId: string, pullId: string): Promise<StoredPull | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, pullId)));
    return row ? toStoredPull(row) : undefined;
  }

  async listForRepo(repoId: string): Promise<StoredPull[]> {
    const rows = await this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
    return rows.map(toStoredPull);
  }

  async upsertFromList(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void> {
    for (const pr of pulls) {
      const updatedAt = iso(pr.updated_at);
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
          openedAt: iso(pr.opened_at),
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [t.pullRequests.repoId, t.pullRequests.number],
          set: { title: pr.title, headSha: pr.head_sha, status: pr.status, updatedAt },
        });
    }
  }

  async updateStats(pullId: string, stats: DiffStats): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, pullId));
  }

  storeDetail(pullId: string, detail: PrDetail): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, pullId));
      if (detail.files.length > 0) {
        await tx.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId: pullId,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, pullId));
      if (detail.commits.length > 0) {
        await tx.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId: pullId,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: iso(c.committed_at),
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
        .where(eq(t.pullRequests.id, pullId));
    });
  }

  async persistedDetail(pull: StoredPull): Promise<PrDetail> {
    const files = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pull.id));
    const commits = await this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, pull.id));
    return {
      id: pull.id,
      number: pull.number,
      title: pull.title,
      author: pull.author,
      branch: pull.branch,
      base: pull.base,
      head_sha: pull.headSha,
      additions: pull.additions,
      deletions: pull.deletions,
      files_count: pull.filesCount,
      status: pull.ghStatus as PrDetail['status'],
      opened_at: pull.openedAt?.toISOString() ?? null,
      updated_at: pull.updatedAt?.toISOString() ?? null,
      body: pull.body ?? null,
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

  async latestScores(pullIds: string[]): Promise<Map<string, number | null>> {
    const rows = await this.db
      .select({ prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, pullIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
    const out = new Map<string, number | null>();
    // Newest first → the first row seen per PR is its latest review.
    for (const r of rows) if (!out.has(r.prId)) out.set(r.prId, r.score);
    return out;
  }

  async runCosts(workspaceId: string, pullIds: string[]): Promise<RunCostRow[]> {
    const rows = await this.db
      .select({
        prId: t.agentRuns.prId,
        agentId: t.agentRuns.agentId,
        status: t.agentRuns.status,
        costUsd: t.agentRuns.costUsd,
      })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.agentRuns.prId, pullIds)))
      .orderBy(desc(t.agentRuns.ranAt));
    return rows.flatMap((r) => (r.prId ? [{ ...r, prId: r.prId }] : []));
  }
}
