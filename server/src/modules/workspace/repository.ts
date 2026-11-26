import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { WorkspaceRepoSummary } from './service.js';

/** workspace — infrastructure: reads repos and maps rows to the summary shape. */
export class WorkspaceRepository {
  constructor(private readonly db: Db) {}

  async listRepoSummaries(workspaceId: string): Promise<WorkspaceRepoSummary[]> {
    const repos = await this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
    return repos.map((r) => ({
      id: r.id,
      full_name: r.fullName,
      clone_path: r.clonePath,
      last_polled_at: r.lastPolledAt?.toISOString() ?? null,
      cloned: Boolean(r.clonePath),
    }));
  }
}
