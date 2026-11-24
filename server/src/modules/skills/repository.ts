import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { isBodyChange } from './helpers.js';

export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source: SkillSource;
  enabled?: boolean;
  evidenceFiles?: string[];
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** Skills data-access (workspace-scoped). Owns `skills` and `skill_versions`. */
export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<(SkillRow & { agentCount: number })[]> {
    const agentCount = sql<number>`(select count(*)::int from ${t.agentSkills} where ${t.agentSkills.skillId} = ${t.skills.id})`;
    const rows = await this.db
      .select({ skill: t.skills, agentCount })
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(t.skills.name);
    return rows.map((r) => ({ ...r.skill, agentCount: Number(r.agentCount) }));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** How many of `ids` exist in this workspace (distinct). */
  async countInWorkspace(workspaceId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, ids)));
    return rows.length;
  }

  /** Insert a skill AND its version-1 snapshot. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: values.source,
        body: values.body,
        enabled: values.enabled ?? true,
        version: 1,
        ...(values.evidenceFiles ? { evidenceFiles: values.evidenceFiles } : {}),
      })
      .returning();
    await this.db
      .insert(t.skillVersions)
      .values({ skillId: row!.id, version: 1, body: row!.body })
      .onConflictDoNothing();
    return row!;
  }

  /** Update; bumps version + snapshots only when `body` actually changes. */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;
    const bump = isBodyChange(existing, patch);
    const nextVersion = bump ? existing.version + 1 : existing.version;
    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(bump ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();
    if (bump && row) {
      await this.db
        .insert(t.skillVersions)
        .values({ skillId: id, version: nextVersion, body: row.body })
        .onConflictDoNothing();
    }
    return row;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

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
}
