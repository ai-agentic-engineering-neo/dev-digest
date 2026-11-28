import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillVersion } from '@devdigest/shared';
import { BadRequestError } from '../../platform/errors.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import type { EffectiveSkill, NewSkill, SkillContent, SkillStore, SkillSummary, StoredSkill } from './ports.js';

/**
 * M2 — skills data-access. Owns `skills` and `skill_versions` and reads no
 * other module's table: agent counts and link ids come from the agents module
 * through the service's `AgentLinks` port. Workspace-scoped throughout. Rows stop here: every method returns a contract
 * or domain type.
 */

type SkillRow = typeof t.skills.$inferSelect;
type SkillVersionRow = typeof t.skillVersions.$inferSelect;

function toSkill(row: SkillRow): StoredSkill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toSkillVersion(row: SkillVersionRow): SkillVersion {
  return {
    version: row.version,
    name: row.name,
    description: row.description,
    type: row.type,
    body: row.body,
    note: row.note ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** The `(workspace_id, name)` unique index, hit by a concurrent create/rename. */
function isNameCollision(err: unknown): boolean {
  const e = err as { code?: string; constraint_name?: string; cause?: unknown };
  const pg = (e?.code ? e : (e?.cause as typeof e | undefined)) ?? {};
  return pg.code === '23505' && pg.constraint_name === 'skills_workspace_name_uq';
}

async function translateCollision<T>(work: () => Promise<T>, name: string): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (isNameCollision(err)) {
      throw new BadRequestError('skill_name_taken', `A skill named "${name}" already exists`);
    }
    throw err;
  }
}

export class SkillsRepository implements SkillStore {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<StoredSkill[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.createdAt), asc(t.skills.name));
    return rows.map(toSkill);
  }

  async getById(workspaceId: string, id: string): Promise<StoredSkill | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row && toSkill(row);
  }

  async nameTaken(workspaceId: string, name: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skills.name, name),
          ...(exceptId ? [ne(t.skills.id, exceptId)] : []),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async insert(values: NewSkill): Promise<StoredSkill> {
    return translateCollision(
      () =>
        this.db.transaction(async (tx) => {
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
              evidenceFiles: values.evidenceFiles ?? null,
              version: INITIAL_SKILL_VERSION,
            })
            .returning();
          await tx.insert(t.skillVersions).values({
            skillId: row!.id,
            version: row!.version,
            name: row!.name,
            description: row!.description,
            type: row!.type,
            body: row!.body,
            note: null,
          });
          return toSkill(row!);
        }),
      values.name,
    );
  }

  async bumpAndSnapshot(
    workspaceId: string,
    id: string,
    content: SkillContent,
    note: string | null,
    enabled?: boolean,
  ): Promise<StoredSkill | undefined> {
    return translateCollision(
      () =>
        this.db.transaction(async (tx) => {
          const [row] = await tx
            .update(t.skills)
            .set({
              name: content.name,
              description: content.description,
              type: content.type,
              body: content.body,
              ...(enabled !== undefined ? { enabled } : {}),
              version: sql`${t.skills.version} + 1`,
              updatedAt: sql`now()`,
            })
            .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
            .returning();
          if (!row) return undefined;
          // A collision on (skill_id, version) is a real error and surfaces.
          await tx.insert(t.skillVersions).values({
            skillId: row.id,
            version: row.version,
            name: row.name,
            description: row.description,
            type: row.type,
            body: row.body,
            note,
          });
          return toSkill(row);
        }),
      content.name,
    );
  }

  async setEnabled(workspaceId: string, id: string, enabled: boolean): Promise<StoredSkill | undefined> {
    const [row] = await this.db
      .update(t.skills)
      .set({ enabled })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();
    return row && toSkill(row);
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(skillId: string): Promise<SkillVersion[]> {
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map(toSkillVersion);
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row && toSkillVersion(row);
  }

  /** The ids among `ids` that are skills of the workspace (the link routes' check). */
  async existingIds(workspaceId: string, ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, [...ids])));
    return rows.map((r) => r.id);
  }

  /** Name, type and global flag of the workspace's skills among `ids` (the agents module's link view). */
  async summaries(workspaceId: string, ids: readonly string[]): Promise<SkillSummary[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({ id: t.skills.id, name: t.skills.name, type: t.skills.type, enabled: t.skills.enabled })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, [...ids])));
  }

  /** The globally enabled skills among `ids`, as prompt content. The caller orders them. */
  async enabledByIds(ids: readonly string[]): Promise<EffectiveSkill[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        id: t.skills.id,
        name: t.skills.name,
        description: t.skills.description,
        type: t.skills.type,
        body: t.skills.body,
        version: t.skills.version,
      })
      .from(t.skills)
      .where(and(inArray(t.skills.id, [...ids]), eq(t.skills.enabled, true)));
  }
}
