import { eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SettingsRow } from './helpers.js';

/**
 * F1 — settings data-access. The ONLY layer touching the DB for non-secret
 * workspace/user prefs. Secrets are NOT stored here — those go via
 * SecretsProvider (see service.ts).
 */
export class SettingsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SettingsRow[]> {
    return this.db.select().from(t.settings).where(eq(t.settings.workspaceId, workspaceId));
  }

  /** Batched upsert of every key/value pair in one round-trip. */
  async upsertMany(
    workspaceId: string,
    userId: string,
    entries: [string, unknown][],
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.db
      .insert(t.settings)
      .values(entries.map(([key, value]) => ({ workspaceId, userId, key, value })))
      .onConflictDoUpdate({
        target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
        set: { value: sql`excluded.value` },
      });
  }
}
