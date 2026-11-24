import { and, eq } from 'drizzle-orm';
import type { PrMeta } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { PolledRepo, PollingRepository } from '../domain/ports.js';

export class DrizzlePollingRepository implements PollingRepository {
  constructor(private readonly db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<PolledRepo | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  recordPoll(workspaceId: string, repoId: string, pulls: PrMeta[], polledAt: Date): Promise<number> {
    return this.db.transaction(async (tx) => {
      for (const pr of pulls) {
        const updatedAt = pr.updated_at ? new Date(pr.updated_at) : null;
        await tx
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
            updatedAt,
          })
          .onConflictDoUpdate({
            target: [t.pullRequests.repoId, t.pullRequests.number],
            set: { title: pr.title, headSha: pr.head_sha, status: pr.status, updatedAt },
          });
      }
      await tx.update(t.repos).set({ lastPolledAt: polledAt }).where(eq(t.repos.id, repoId));
      return pulls.length;
    });
  }
}
