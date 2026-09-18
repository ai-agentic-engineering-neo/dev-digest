import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { RepoRow } from '../../db/rows.js';

/**
 * F1 — workspace data-access. The ONLY place in this module that touches
 * the DB. Workspace-scoped like every other repository.
 */
export class WorkspaceRepository {
  constructor(private db: Db) {}

  listRepos(workspaceId: string): Promise<RepoRow[]> {
    return this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
  }
}
