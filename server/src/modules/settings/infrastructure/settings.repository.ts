import { eq } from 'drizzle-orm';
import {
  FeatureModelChoice,
  type FeatureModelId,
  type Settings,
} from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { SettingsRepository } from '../domain/ports.js';

/** Collapse key/value rows into one flat `Settings` object. */
function rowsToSettings(rows: { key: string; value: unknown }[]): Settings {
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

export class DrizzleSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Db) {}

  async all(workspaceId: string): Promise<Settings> {
    const rows = await this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    return rowsToSettings(rows);
  }

  async upsert(workspaceId: string, userId: string, entries: Record<string, unknown>): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(entries)) {
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

  /** jsonb enters the app here, so the stored choice is parsed here. */
  async featureModelOverride(workspaceId: string, id: FeatureModelId) {
    const fm = ((await this.all(workspaceId)) as { feature_models?: Record<string, unknown> })
      .feature_models;
    const parsed = FeatureModelChoice.safeParse(fm?.[id]);
    return parsed.success ? parsed.data : undefined;
  }
}
