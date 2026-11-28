import { eq, sql } from 'drizzle-orm';
import type { Settings } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SettingsStore } from './ports.js';

/**
 * F1 — settings data-access. The only place that touches the `settings`
 * table. Secrets are NOT stored here — only non-secret prefs.
 */
export class SettingsRepository implements SettingsStore {
  constructor(private db: Db) {}

  /** Collapse the workspace's key/value rows into a flat `Settings` object. */
  async get(workspaceId: string): Promise<Settings> {
    const rows = await this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    const out: Record<string, unknown> = {};
    for (const r of rows) out[r.key] = r.value;
    return out as Settings;
  }

  async put(workspaceId: string, userId: string, values: Record<string, unknown>): Promise<void> {
    const entries = Object.entries(values);
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
