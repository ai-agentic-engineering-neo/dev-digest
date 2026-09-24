import { eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import type { DbOrTx } from '../../db/client.js';

/** A cloned-repo summary row for the workspace overview. */
export interface WorkspaceRepo {
  id: string;
  fullName: string;
  clonePath: string | null;
  lastPolledAt: Date | null;
}

/** Workspace persistence (infrastructure). */
export class WorkspaceRepository {
  constructor(private readonly db: DbOrTx) {}

  async listRepos(workspaceId: string): Promise<WorkspaceRepo[]> {
    return this.db
      .select({
        id: t.repos.id,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
        lastPolledAt: t.repos.lastPolledAt,
      })
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
  }
}
