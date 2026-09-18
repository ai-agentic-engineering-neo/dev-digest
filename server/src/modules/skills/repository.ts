import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillType } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isConfigChange } from './helpers.js';

export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: 'manual' | 'imported' | 'imported_url' | 'extracted' | 'community';
  body: string;
  enabled?: boolean;
  note?: string | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  note?: string | null;
}

/**
 * Skills data-access. Owns `skills` and `skill_versions`. Workspace-scoped.
 * Agent-side links live on AgentsRepository (`agent_skills`).
 */
export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in skill_versions. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source,
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
        })
        .returning();
      await tx.insert(t.skillVersions).values({
        skillId: row!.id,
        version: INITIAL_SKILL_VERSION,
        body: row!.body,
        note: values.note ?? null,
      });
      return row!;
    });
  }

  /**
   * Update a skill. Any config change (name/description/type/body) bumps the
   * version and snapshots the new body. Toggling `enabled` does not.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion, patch.note);
    return row;
  }

  /** Snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /**
   * Copy a snapshot body onto the live skill, always bump version, and append a
   * new snapshot. Old rows stay (append-only).
   */
  async restore(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;
    const snap = await this.getVersion(id, version);
    if (!snap) return undefined;

    const nextVersion = existing.version + 1;
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({ body: snap.body, version: nextVersion })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (row) {
        await tx.insert(t.skillVersions).values({
          skillId: row.id,
          version: nextVersion,
          body: row.body,
          note: `restored-from-v${version}`,
        });
      }
      return row;
    });
  }

  private async snapshotVersion(
    row: SkillRow,
    version: number,
    note?: string | null,
  ): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({
        skillId: row.id,
        version,
        body: row.body,
        note: note ?? null,
      })
      .onConflictDoNothing();
  }
}
