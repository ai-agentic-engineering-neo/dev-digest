import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastRepositoryPort } from './ports.js';

export class BlastRepository implements BlastRepositoryPort {
  constructor(private readonly db: Db) {}

  /** Changed file paths of a PR; the join on `pull_requests.workspace_id` is the authz filter. */
  async listChangedPaths(workspaceId: string, prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(and(eq(t.prFiles.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)))
      .orderBy(asc(t.prFiles.path));
    return [...new Set(rows.map((r) => r.path))];
  }
}
