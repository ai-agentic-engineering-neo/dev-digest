import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SettingsRow } from './helpers.js';

/**
 * F1 — settings data-access layer. The ONLY place that touches the `settings`
 * table. Prefs are key/value rows scoped by workspace; secrets never land here.
 */
export class SettingsRepository {
  constructor(private db: Db) {}

  async listForWorkspace(workspaceId: string): Promise<SettingsRow[]> {
    return this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
  }

  async upsert(
    workspaceId: string,
    userId: string,
    entries: [string, unknown][],
  ): Promise<void> {
    for (const [key, value] of entries) {
      await this.db
        .insert(t.settings)
        .values({ workspaceId, userId, key, value })
        .onConflictDoUpdate({
          target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
          set: { value },
        });
    }
  }
}
