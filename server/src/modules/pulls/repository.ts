import { and, eq } from 'drizzle-orm';
import type { PrDetail, PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { DiffStats, PullStore, StoredPull } from './ports.js';

/**
 * F1 — pulls data-access. Owns the import side of `pull_requests`, `pr_files`
 * and `pr_commits`. Import is idempotent (unique repo_id + number).
 */

function toStoredPull(row: typeof t.pullRequests.$inferSelect): StoredPull {
  return {
    id: row.id,
    repoId: row.repoId,
    number: row.number,
    title: row.title,
    author: row.author,
    branch: row.branch,
    base: row.base,
    headSha: row.headSha,
    additions: row.additions,
    deletions: row.deletions,
    filesCount: row.filesCount,
    ghStatus: row.status,
    lastReviewedSha: row.lastReviewedSha,
    openedAt: row.openedAt,
    updatedAt: row.updatedAt,
    body: row.body,
  };
}

export class PullsRepository implements PullStore {
  constructor(private db: Db) {}

  async upsertFromGitHub(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void> {
    for (const pr of pulls) {
      const updatedAt = pr.updated_at ? new Date(pr.updated_at) : null;
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
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [t.pullRequests.repoId, t.pullRequests.number],
          set: { title: pr.title, headSha: pr.head_sha, status: pr.status, updatedAt },
        });
    }
  }

  async listForRepo(repoId: string): Promise<StoredPull[]> {
    const rows = await this.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repoId));
    return rows.map(toStoredPull);
  }

  async getById(workspaceId: string, id: string): Promise<StoredPull | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    return row && toStoredPull(row);
  }

  async setDiffStats(pullId: string, stats: DiffStats): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, pullId));
  }

  /**
   * Record the commit a review just ran against, so the PR list can derive
   * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
   * Called by the reviews module through its `PullAccess` port.
   */
  async markReviewed(pullId: string, sha: string): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ lastReviewedSha: sha })
      .where(eq(t.pullRequests.id, pullId));
  }

  async saveDetail(pullId: string, detail: PrDetail): Promise<void> {
    await this.db.transaction(async (tx) => {
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
        .where(eq(t.pullRequests.id, pullId));
    });
  }

  async filesAndCommits(pullId: string): Promise<Pick<PrDetail, 'files' | 'commits'>> {
    const files = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pullId));
    const commits = await this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, pullId));
    return {
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
}
