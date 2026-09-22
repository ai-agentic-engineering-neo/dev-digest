import { and, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import type { DbOrTx } from '../../db/client.js';

/** The GitHub coordinates of a repo, plus its row id. */
export interface PolledRepo {
  id: string;
  owner: string;
  name: string;
}

/** Polling persistence (infrastructure): repo lookup + the last-polled stamp. */
export class PollingRepository {
  constructor(private readonly db: DbOrTx) {}

  async findRepo(workspaceId: string, repoId: string): Promise<PolledRepo | null> {
    const [repo] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return repo ?? null;
  }

  async markPolled(repoId: string, at: Date): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: at }).where(eq(t.repos.id, repoId));
  }
}
