import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * blast data-access layer. The ONLY file in this module that touches the DB.
 * Reads `pull_requests` (workspace-scoped, the tenancy guard) and `pr_files`.
 */
export interface PullScope {
  repoId: string;
  headSha: string;
}

export interface BlastRepo {
  getPullScope(workspaceId: string, prId: string): Promise<PullScope | undefined>;
  getChangedPaths(prId: string): Promise<string[]>;
}

export class BlastRepository implements BlastRepo {
  constructor(private db: Db) {}

  async getPullScope(workspaceId: string, prId: string): Promise<PullScope | undefined> {
    const [row] = await this.db
      .select({ repoId: t.pullRequests.repoId, headSha: t.pullRequests.headSha })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getChangedPaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }
}
