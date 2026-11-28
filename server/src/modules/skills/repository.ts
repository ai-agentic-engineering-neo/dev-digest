import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import type {
  NewSkill,
  SkillPatch,
  SkillRecord,
  SkillsRepositoryPort,
  SkillUsageSummary,
  SkillVersionRecord,
} from './types.js';

/**
 * Skills data-access (implements SkillsRepositoryPort). Owns `skills` and
 * `skill_versions`; reads `agent_skills` / `agent_run_skills` / runs / findings
 * for usage stats. Workspace-scoped throughout.
 */

function toRecord(r: SkillRow): SkillRecord {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    name: r.name,
    description: r.description,
    type: r.type,
    source: r.source,
    body: r.body,
    enabled: r.enabled,
    version: r.version,
    evidenceFiles: r.evidenceFiles ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toVersion(r: SkillVersionRow): SkillVersionRecord {
  return { version: r.version, body: r.body, changeNote: r.changeNote, createdAt: r.createdAt };
}

export class SkillsRepository implements SkillsRepositoryPort {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRecord[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    return rows.map(toRecord);
  }

  async get(workspaceId: string, id: string): Promise<SkillRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row ? toRecord(row) : undefined;
  }

  async getByName(workspaceId: string, name: string): Promise<SkillRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row ? toRecord(row) : undefined;
  }

  async insert(s: NewSkill): Promise<SkillRecord> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: s.workspaceId,
          name: s.name,
          description: s.description,
          type: s.type,
          source: s.source,
          body: s.body,
          enabled: s.enabled,
          version: 1,
        })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: 1, body: s.body, changeNote: s.changeNote });
      return toRecord(row!);
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: SkillPatch,
  ): Promise<SkillRecord | undefined> {
    return this.db.transaction(async (tx) => {
      // Lock the row so two concurrent saves can't both claim version N+1.
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;
      const bodyChanged = patch.body !== undefined && patch.body.text !== existing.body;
      const nextVersion = bodyChanged ? existing.version + 1 : existing.version;
      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bodyChanged ? { body: patch.body!.text, version: nextVersion } : {}),
          updatedAt: new Date(),
        })
        .where(eq(t.skills.id, id))
        .returning();
      if (bodyChanged) {
        await tx.insert(t.skillVersions).values({
          skillId: id,
          version: nextVersion,
          body: patch.body!.text,
          changeNote: patch.body!.changeNote,
        });
      }
      return row ? toRecord(row) : undefined;
    });
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async listVersions(skillId: string): Promise<SkillVersionRecord[]> {
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map(toVersion);
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row ? toVersion(row) : undefined;
  }

  /**
   * Per-skill usage over [since, now): agents enabled now, runs whose prompt
   * carried the skill, runs of every agent that has/had it (denominator for
   * pull frequency), and finding feedback from the skill's runs. One round-trip.
   */
  async usageSummaries(
    workspaceId: string,
    since: Date,
    skillId?: string,
  ): Promise<SkillUsageSummary[]> {
    const onlySkill = skillId ? sql`AND s.id = ${skillId}` : sql``;
    // ISO string + explicit cast: postgres-js can't bind a raw Date in sql``.
    const from = sql`${since.toISOString()}::timestamptz`;
    const rows = await this.db.execute<{
      skill_id: string;
      agents_count: number;
      runs_with_skill: number;
      agent_runs: number;
      findings: number;
      accepted: number;
      dismissed: number;
    }>(sql`
      WITH ws_skills AS (
        SELECT s.id FROM skills s WHERE s.workspace_id = ${workspaceId} ${onlySkill}
      ),
      skill_runs AS (
        SELECT ars.skill_id, ar.id AS run_id, ar.agent_id
        FROM agent_run_skills ars
        JOIN agent_runs ar ON ar.id = ars.run_id
        WHERE ars.skill_id IN (SELECT id FROM ws_skills) AND ar.ran_at >= ${from}
      ),
      skill_agents AS (
        SELECT skill_id, agent_id FROM agent_skills
        WHERE enabled AND skill_id IN (SELECT id FROM ws_skills)
        UNION
        SELECT skill_id, agent_id FROM skill_runs WHERE agent_id IS NOT NULL
      ),
      denom AS (
        SELECT sa.skill_id, count(ar.id)::int AS runs
        FROM skill_agents sa
        JOIN agent_runs ar ON ar.agent_id = sa.agent_id
          AND ar.ran_at >= ${from} AND ar.status = 'done'
        GROUP BY sa.skill_id
      ),
      num AS (
        SELECT skill_id, count(*)::int AS runs FROM skill_runs GROUP BY skill_id
      ),
      fb AS (
        SELECT sr.skill_id,
               count(f.id)::int AS findings,
               count(f.accepted_at)::int AS accepted,
               count(f.dismissed_at)::int AS dismissed
        FROM skill_runs sr
        JOIN reviews r ON r.run_id = sr.run_id
        JOIN findings f ON f.review_id = r.id
        GROUP BY sr.skill_id
      ),
      linked AS (
        SELECT skill_id, count(*)::int AS n FROM agent_skills
        WHERE enabled AND skill_id IN (SELECT id FROM ws_skills)
        GROUP BY skill_id
      )
      SELECT w.id AS skill_id,
             coalesce(linked.n, 0) AS agents_count,
             coalesce(num.runs, 0) AS runs_with_skill,
             coalesce(denom.runs, 0) AS agent_runs,
             coalesce(fb.findings, 0) AS findings,
             coalesce(fb.accepted, 0) AS accepted,
             coalesce(fb.dismissed, 0) AS dismissed
      FROM ws_skills w
      LEFT JOIN linked ON linked.skill_id = w.id
      LEFT JOIN num ON num.skill_id = w.id
      LEFT JOIN denom ON denom.skill_id = w.id
      LEFT JOIN fb ON fb.skill_id = w.id
    `);
    return [...rows].map((r) => ({
      skillId: r.skill_id,
      agentsCount: Number(r.agents_count),
      runsWithSkill: Number(r.runs_with_skill),
      agentRuns: Number(r.agent_runs),
      findings: Number(r.findings),
      accepted: Number(r.accepted),
      dismissed: Number(r.dismissed),
    }));
  }

  async usedBy(skillId: string): Promise<{ agentId: string; name: string }[]> {
    const rows = await this.db
      .select({ agentId: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agentSkills.enabled, true)))
      .orderBy(asc(t.agents.name));
    return rows;
  }

  async findingsByCategory(
    skillId: string,
    since: Date,
  ): Promise<{ category: string; count: number }[]> {
    const from = sql`${since.toISOString()}::timestamptz`;
    const rows = await this.db.execute<{ category: string; count: number }>(sql`
      SELECT f.category, count(*)::int AS count
      FROM agent_run_skills ars
      JOIN agent_runs ar ON ar.id = ars.run_id
      JOIN reviews r ON r.run_id = ars.run_id
      JOIN findings f ON f.review_id = r.id
      WHERE ars.skill_id = ${skillId} AND ar.ran_at >= ${from}
      GROUP BY f.category
      ORDER BY count DESC, f.category
    `);
    return [...rows].map((r) => ({ category: r.category, count: Number(r.count) }));
  }
}
