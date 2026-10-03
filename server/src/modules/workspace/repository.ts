import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * F1 — workspace data-access. The ONLY layer touching the DB for this
 * module's single read: the workspace's cloned-repos summary.
 */
export class WorkspaceRepository {
  constructor(private db: Db) {}

  async listRepos(workspaceId: string): Promise<(typeof t.repos.$inferSelect)[]> {
    return this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
  }
}
