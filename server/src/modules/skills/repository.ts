import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { DEFAULT_SKILL_DESCRIPTION, INITIAL_SKILL_VERSION } from './constants.js';

/**
 * A1 — skills data-access. Owns `skills` and `skill_versions`. The
 * `agent_skills` link table is shared with A2's agents repository (which owns
 * the agent side: link/reorder/list for an agent) — this repository only
 * reads it read-only, to derive `agents_count` per skill. Workspace-scoped
 * throughout (skills belong to a workspace; skill_versions/agent_skills are
 * reached through the owning skill/agent).
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
  /** Optional note recorded on the new `skill_versions` snapshot when `body` changes. */
  changeNote?: string | null;
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

  /** Delete a skill (scoped to workspace). Versions/agent-links cascade. Returns
   *  false if no such skill existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in skill_versions (immutable snapshot). */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
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
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION);
    return row!;
  }

  /**
   * Update a skill. Only a `body` change bumps the version and snapshots the
   * new body into skill_versions (reproducibility for eval / history).
   * Toggling `enabled` (or editing name/description/type/source alone) never
   * bumps the version.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) await this.snapshotVersion(row, nextVersion, patch.changeNote ?? null);
    return row;
  }

  /**
   * Restore an old version's body as a NEW version on top (history is
   * append-only, never rewritten) — reads the snapshot, then goes through the
   * same `update()` path so the usual body-changed-bumps-version rule applies.
   * Returns undefined when the skill isn't in this workspace or that version
   * was never recorded.
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;
    const snapshot = await this.getVersion(id, version);
    if (!snapshot) return undefined;
    return this.update(workspaceId, id, {
      body: snapshot.body,
      changeNote: `Restored from v${version}`,
    });
  }

  private async snapshotVersion(
    row: SkillRow,
    version: number,
    changeNote: string | null = null,
  ): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body, changeNote })
      .onConflictDoNothing();
  }

  // ---- skill_versions (immutable body snapshots) ---------------------------

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

  // ---- agent_skills (read-only here — A2's agents repository owns writes) --

  /**
   * Raw (agentId, skillId) pairs for every agent_skills link touching one of
   * this workspace's skills — ONE query, joined once; both `agentCounts` and
   * `skillCountsByAgent` reduce it in JS in opposite directions (this codebase
   * deliberately has no SQL GROUP BY, see server/INSIGHTS.md 2026-09-18).
   */
  private async agentSkillPairs(
    workspaceId: string,
  ): Promise<{ agentId: string; skillId: string }[]> {
    return this.db
      .select({ agentId: t.agentSkills.agentId, skillId: t.agentSkills.skillId })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId));
  }

  /**
   * Count of DISTINCT agents linked to each of the workspace's skills, keyed
   * by skill id — used to populate `Skill.agents_count`.
   */
  async agentCounts(workspaceId: string): Promise<Map<string, number>> {
    const pairs = await this.agentSkillPairs(workspaceId);
    const counts = new Map<string, number>();
    for (const p of pairs) counts.set(p.skillId, (counts.get(p.skillId) ?? 0) + 1);
    return counts;
  }

  /**
   * Count of DISTINCT skills linked to each of the workspace's agents, keyed
   * by agent id — used to populate `Agent.skills_count` in one batch call
   * (AgentsService.list()), the mirror image of `agentCounts`.
   */
  async skillCountsByAgent(workspaceId: string): Promise<Map<string, number>> {
    const pairs = await this.agentSkillPairs(workspaceId);
    const counts = new Map<string, number>();
    for (const p of pairs) counts.set(p.agentId, (counts.get(p.agentId) ?? 0) + 1);
    return counts;
  }
}
