import { and, count, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isBodyChange } from './helpers.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`; reads `agent_skills`
 * only to count attachments (the agents repository owns linking).
 * Workspace-scoped throughout.
 */

export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  evidenceFiles?: string[] | null;
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

  /** All skills in the workspace (oldest first) with their attached-agent count. */
  async list(workspaceId: string): Promise<Array<{ skill: SkillRow; agentCount: number }>> {
    const rows = await this.db
      .select({ skill: t.skills, agentCount: count(t.agentSkills.agentId) })
      .from(t.skills)
      .leftJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.skills.id)
      .orderBy(t.skills.createdAt);
    return rows.map((r) => ({ skill: r.skill, agentCount: Number(r.agentCount) }));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Insert a skill AND record version 1 in skill_versions. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ ...values, version: INITIAL_SKILL_VERSION })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: row!.body });
      return row!;
    });
  }

  /**
   * Update a skill. A changed body bumps the version and snapshots it; name,
   * description, type and enabled edits keep the current version.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;

      const bodyChanged = isBodyChange(existing, patch.body);
      const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bodyChanged ? { body: patch.body!, version: nextVersion } : {}),
        })
        .where(eq(t.skills.id, id))
        .returning();

      if (bodyChanged) {
        await tx.insert(t.skillVersions).values({ skillId: id, version: nextVersion, body: patch.body! });
      }
      return row;
    });
  }

  /** Delete a skill; versions and agent links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async countAgents(skillId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, skillId));
    return Number(row?.n ?? 0);
  }

  /** Body snapshots, newest first. */
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
