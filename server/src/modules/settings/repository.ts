import { eq, sql } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import type { DbOrTx } from '../../db/client.js';
import type { SettingsRow } from './helpers.js';

/** Settings persistence (infrastructure): per-workspace key/value prefs. */
export class SettingsRepository {
  constructor(private readonly db: DbOrTx) {}

  async listForWorkspace(workspaceId: string): Promise<SettingsRow[]> {
    return this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
  }

  /** One multi-row upsert → all keys land atomically (or none do). */
  async upsertMany(workspaceId: string, userId: string, entries: SettingsRow[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db
      .insert(t.settings)
      .values(entries.map(({ key, value }) => ({ workspaceId, userId, key, value })))
      .onConflictDoUpdate({
        target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
        set: { value: sql`excluded.value` },
      });
  }
}
