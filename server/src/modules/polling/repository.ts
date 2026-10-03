import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * F1 — polling data-access. Owns only the `last_polled_at` bump — the actual
 * PR-list sync/upsert is owned by `pulls/repository.ts` (PullsRepository) and
 * reused here via PullsService, so that logic exists in exactly one place.
 */
export class PollingRepository {
  constructor(private db: Db) {}

  async touchLastPolled(repoId: string): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: new Date() }).where(eq(t.repos.id, repoId));
  }
}
