import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { DEFAULT_SKILL_DESCRIPTION, INITIAL_SKILL_VERSION } from './constants.js';

/** The handle Drizzle hands a `db.transaction()` callback. */
type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Skills data-access (ring ③). Owns `skills`, `skill_versions` and the type
 * catalogue `skill_types`. Workspace-scoped throughout.
 *
 * It does NOT own `agent_skills` — the agents repository owns the agent side of
 * that link table (link / reorder / list for an agent).
 *
 * Never imports Container or another module's repository.
 */

export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;
export type SkillTypeRow = typeof t.skillTypes.$inferSelect;

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: string;
  source: 'manual' | 'imported_url' | 'extracted' | 'community';
  body: string;
  enabled?: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: string;
  body?: string;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /**
   * Which of `ids` exist in this workspace. The callers that link skills to an
   * agent need this: `agent_skills.skill_id` is only a foreign key, so it proves
   * a skill EXISTS but not that it belongs to the caller's tenant.
   */
  async existingIds(workspaceId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, ids)));
    return new Set(rows.map((r) => r.id));
  }

  /** Delete a skill (scoped to workspace). Versions and agent links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /**
   * Insert a skill, record version 1, and register its type — all in ONE
   * transaction, so a skill can never exist with a type missing from the
   * catalogue the editor's dropdown reads.
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

      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: row!.body })
        .onConflictDoNothing();

      await this.registerType(tx, values.workspaceId, values.type);
      return row!;
    });
  }

  /**
   * Update a skill. A BODY change bumps `version` and snapshots the new body
   * into `skill_versions`; a name/description/type-only edit does not (see
   * `isBodyChange`). A submitted type joins the catalogue either way.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
    bumpVersion: boolean,
  ): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      // Locked so two concurrent body edits can't both read the same
      // `version`, bump it in memory, and overwrite each other's snapshot
      // insert — the second commit must see the first's row.
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;

      const nextVersion = bumpVersion ? existing.version + 1 : existing.version;

      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bumpVersion ? { version: nextVersion } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();

      if (bumpVersion && row) {
        // No onConflictDoNothing: with the row locked above, a collision here
        // means two transactions computed the same `nextVersion` and the
        // locking was bypassed — that must throw, not silently drop a version.
        await tx.insert(t.skillVersions).values({ skillId: row.id, version: nextVersion, body: row.body });
      }
      if (patch.type !== undefined) await this.registerType(tx, workspaceId, patch.type);

      return row;
    });
  }

  // ---- skill_versions (immutable body snapshots) --------------------------

  /** All snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** A single snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /**
   * Roll a skill back to `version`: its body becomes that snapshot's body, its
   * `version` becomes that number, and every STRICTLY NEWER snapshot is deleted.
   *
   * Destructive and deliberately so — the Versions tab warns before calling it.
   * One transaction, so a crash can never leave the row pointing at a version
   * whose snapshot has already been deleted. Returns undefined when the skill or
   * that version does not exist.
   */
  async restoreVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      // Same lock as `update` — a restore racing a concurrent body edit must
      // not interleave with it.
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)))
        .for('update');
      if (!existing) return undefined;

      const [snapshot] = await tx
        .select()
        .from(t.skillVersions)
        .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
      if (!snapshot) return undefined;

      await tx
        .delete(t.skillVersions)
        .where(and(eq(t.skillVersions.skillId, skillId), gt(t.skillVersions.version, version)));

      const [row] = await tx
        .update(t.skills)
        .set({ body: snapshot.body, version })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)))
        .returning();
      return row;
    });
  }

  // ---- skill_types (the editor's dropdown catalogue) ----------------------

  async listTypes(workspaceId: string): Promise<SkillTypeRow[]> {
    return this.db
      .select()
      .from(t.skillTypes)
      .where(eq(t.skillTypes.workspaceId, workspaceId))
      .orderBy(asc(t.skillTypes.name));
  }

  /**
   * Add a type name to the workspace's catalogue if it is new. Idempotent via
   * the (workspace_id, name) unique constraint.
   *
   * Takes the transaction handle so a save registers its type atomically with
   * the skill itself.
   */
  private async registerType(tx: DbTx, workspaceId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    await tx.insert(t.skillTypes).values({ workspaceId, name: trimmed }).onConflictDoNothing();
  }
}
