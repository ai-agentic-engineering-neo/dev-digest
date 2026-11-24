import { eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { WorkspaceRepository } from '../domain/ports.js';
import type { WorkspaceRepo } from '../domain/types.js';

/** Read model over `repos` (owned by the repos module) for the workspace overview. */
export class DrizzleWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: Db) {}

  async listRepos(workspaceId: string): Promise<WorkspaceRepo[]> {
    const rows = await this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      clonePath: r.clonePath,
      lastPolledAt: r.lastPolledAt,
    }));
  }
}
