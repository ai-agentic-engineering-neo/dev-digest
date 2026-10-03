import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { DEFAULT_SKILL_DESCRIPTION, INITIAL_SKILL_VERSION } from './constants.js';
import { isBodyChange } from './helpers.js';

/**
 * Skills data-access. Sole owner of `skills` and `skill_versions`.
 * Workspace-scoped throughout (skills are tenant data, same as agents).
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

/** The transaction handle `db.transaction(async (tx) => ...)` hands its callback. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

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

  /** Delete a skill (scoped to workspace). Versions cascade. Returns false if
   *  no such skill existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /**
   * Insert a skill AND record version 1 in skill_versions (immutable
   * snapshot). Both writes happen in one transaction — a snapshot failure
   * rolls back the skill insert instead of leaving a skill with no version 1
   * row (which listVersions assumes always exists).
   */
  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description ?? DEFAULT_SKILL_DESCRIPTION,
          type: values.type,
          source: values.source,
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
        })
        .returning();
      await this.snapshotVersion(tx, row!, INITIAL_SKILL_VERSION);
      return row!;
    });
  }

  /**
   * Update a skill. Only a `body` change bumps the version and snapshots the
   * new body into skill_versions (immutable history of what the skill said at
   * each version) — a bare `enabled` toggle, or a name/description/type edit,
   * never bumps it. The update + its snapshot happen in one transaction — a
   * snapshot failure rolls back the version bump instead of leaving
   * `skills.version` pointing at a snapshot that was never written.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = isBodyChange(existing, patch);
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bodyChanged ? { version: nextVersion } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();

      if (bodyChanged && row) await this.snapshotVersion(tx, row, nextVersion);
      return row;
    });
  }

  private async snapshotVersion(tx: Tx, row: SkillRow, version: number): Promise<void> {
    await tx
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body })
      .onConflictDoNothing();
  }

  // ---- skill_versions (immutable body snapshots) ---------------------------

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }
}
