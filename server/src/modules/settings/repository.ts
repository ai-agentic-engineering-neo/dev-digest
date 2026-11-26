import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SettingsRow } from './helpers.js';

/**
 * settings — infrastructure. The key/value `settings` table, always scoped by
 * workspace. Returns plain key/value pairs; the service shapes them into the
 * `Settings` contract (onion-architecture §8).
 */
export class SettingsRepository {
  constructor(private readonly db: Db) {}

  /** Every stored pref of the workspace as key/value pairs. */
  async listForWorkspace(workspaceId: string): Promise<SettingsRow[]> {
    const rows = await this.db.select().from(t.settings).where(eq(t.settings.workspaceId, workspaceId));
    return rows.map((r) => ({ key: r.key, value: r.value }));
  }

  /** Upsert each key for (workspace, user) in one transaction: a PUT saves all keys or none. */
  async upsertMany(workspaceId: string, userId: string, entries: [string, unknown][]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [key, value] of entries) {
        await tx
          .insert(t.settings)
          .values({ workspaceId, userId, key, value })
          .onConflictDoUpdate({
            target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
            set: { value },
          });
      }
    });
  }
}
