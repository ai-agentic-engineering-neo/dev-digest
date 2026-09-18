import { and, eq } from 'drizzle-orm';
import type { PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { RepoRow } from '../../db/rows.js';

/**
 * F1 — polling data-access. The ONLY place in this module that touches the
 * DB. Workspace-scoped like every other repository.
 */
export class PollingRepository {
  constructor(private db: Db) {}

  getRepoById(workspaceId: string, id: string): Promise<RepoRow | undefined> {
    return this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)))
      .then((rows) => rows[0]);
  }

  /**
   * Idempotent upsert of every listed PR + last_polled_at bump, in one
   * transaction — a crash mid-loop otherwise leaves some PRs upserted and
   * `lastPolledAt` stale, silently reporting a poll that half-happened.
   */
  async syncPulls(workspaceId: string, repo: RepoRow, pulls: PrMeta[]): Promise<number> {
    let synced = 0;
    await this.db.transaction(async (tx) => {
      for (const pr of pulls) {
        await tx
          .insert(t.pullRequests)
          .values({
            workspaceId,
            repoId: repo.id,
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
        synced++;
      }
      await tx.update(t.repos).set({ lastPolledAt: new Date() }).where(eq(t.repos.id, repo.id));
    });
    return synced;
  }
}
