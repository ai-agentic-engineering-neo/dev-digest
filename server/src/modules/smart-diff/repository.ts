import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SmartDiffFileInput } from './domain.js';
import type { SmartDiffRepositoryPort } from './ports.js';

export class SmartDiffRepository implements SmartDiffRepositoryPort {
  constructor(private readonly db: Db) {}

  /**
   * pr_files has no workspace_id, so the scope comes from the parent PR (join), not from
   * callers remembering to check ownership first. No ORDER BY: pr_files has no ordinal;
   * the client orders by PR detail order.
   */
  async listFiles(workspaceId: string, prId: string): Promise<SmartDiffFileInput[]> {
    return this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(and(eq(t.prFiles.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
  }
}
