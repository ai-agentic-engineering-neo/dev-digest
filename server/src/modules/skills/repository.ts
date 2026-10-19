import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import type {
  NewSkill,
  SkillPatch,
  SkillRecord,
  SkillStore,
  SkillUsage,
  SkillUsageDetail,
  SkillVersionRecord,
} from './ports.js';
import { INITIAL_SKILL_VERSION, STATS_WINDOW_DAYS } from './constants.js';

/**
 * (run_id, skill_id) for every completed run of the workspace whose prompt
 * included the skill — read from the trace's `prompt_assembly.skills_detail`
 * (traces of runs before L02 have no such array → no rows).
 */
const pulledRuns = (workspaceId: string) => sql`
  SELECT ar.id AS run_id, ar.agent_id, (d->>'id')::uuid AS skill_id
  FROM agent_runs ar
  JOIN run_traces rt ON rt.run_id = ar.id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(rt.trace->'prompt_assembly'->'skills_detail') = 'array'
         THEN rt.trace->'prompt_assembly'->'skills_detail' ELSE '[]'::jsonb END
  ) d
  WHERE ar.workspace_id = ${workspaceId} AND ar.status = 'done'
`;

type SkillRow = typeof t.skills.$inferSelect;

const toRecord = (r: SkillRow): SkillRecord => ({
  id: r.id,
  workspaceId: r.workspaceId,
  name: r.name,
  description: r.description,
  type: r.type as SkillType,
  source: r.source as SkillSource,
  body: r.body,
  enabled: r.enabled,
  version: r.version,
  evidenceFiles: r.evidenceFiles ?? null,
  createdAt: r.createdAt,
});

/** L02 — Drizzle adapter for `skills` + `skill_versions`. Workspace-scoped. */
export class SkillsRepository implements SkillStore {
  constructor(private readonly db: Db) {}

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
    return row && toRecord(row);
  }

  async findByName(workspaceId: string, name: string): Promise<SkillRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row && toRecord(row);
  }

  async insert(skill: NewSkill): Promise<SkillRecord> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ ...skill, version: INITIAL_SKILL_VERSION })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: row!.body });
      return toRecord(row!);
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: SkillPatch,
    newVersion?: { body: string; message: string | null },
  ): Promise<SkillRecord | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({
          ...patch,
          ...(newVersion !== undefined
            ? { body: newVersion.body, version: sql`${t.skills.version} + 1` }
            : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (!row) return undefined;
      if (newVersion !== undefined) {
        await tx
          .insert(t.skillVersions)
          .values({ skillId: row.id, version: row.version, body: row.body, message: newVersion.message });
      }
      return toRecord(row);
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
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async usage(workspaceId: string): Promise<Map<string, SkillUsage>> {
    const rows = await this.db.execute<{
      skill_id: string;
      agents: string;
      agent_runs: string;
      pulled_runs: string;
      accepted: string;
      dismissed: string;
    }>(sql`
      WITH links AS (
        SELECT ags.skill_id, ags.agent_id
        FROM agent_skills ags JOIN skills s ON s.id = ags.skill_id
        WHERE s.workspace_id = ${workspaceId} AND ags.enabled
      ),
      pulled AS (${pulledRuns(workspaceId)}),
      runs AS (
        SELECT l.skill_id,
               count(ar.id) AS agent_runs,
               count(p.run_id) AS pulled_runs
        FROM links l
        JOIN agent_runs ar ON ar.agent_id = l.agent_id AND ar.status = 'done'
        LEFT JOIN pulled p ON p.run_id = ar.id AND p.skill_id = l.skill_id
        GROUP BY l.skill_id
      ),
      verdicts AS (
        SELECT p.skill_id, count(f.accepted_at) AS accepted, count(f.dismissed_at) AS dismissed
        FROM pulled p
        JOIN reviews rv ON rv.run_id = p.run_id
        JOIN findings f ON f.review_id = rv.id
        GROUP BY p.skill_id
      ),
      ids AS (
        SELECT skill_id FROM links UNION SELECT skill_id FROM verdicts
      )
      SELECT ids.skill_id,
             (SELECT count(*) FROM links l WHERE l.skill_id = ids.skill_id) AS agents,
             coalesce(r.agent_runs, 0) AS agent_runs,
             coalesce(r.pulled_runs, 0) AS pulled_runs,
             coalesce(v.accepted, 0) AS accepted,
             coalesce(v.dismissed, 0) AS dismissed
      FROM ids
      LEFT JOIN runs r ON r.skill_id = ids.skill_id
      LEFT JOIN verdicts v ON v.skill_id = ids.skill_id
    `);
    return new Map(
      Array.from(rows, (r) => [
        r.skill_id,
        {
          agents: Number(r.agents),
          agentRuns: Number(r.agent_runs),
          pulledRuns: Number(r.pulled_runs),
          accepted: Number(r.accepted),
          dismissed: Number(r.dismissed),
        },
      ]),
    );
  }

  async usageDetail(workspaceId: string, skillId: string): Promise<SkillUsageDetail> {
    const usage = (await this.usage(workspaceId)).get(skillId);
    const agentList = await this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agentSkills.enabled, true)))
      .orderBy(asc(t.agents.name));
    const categories = await this.db.execute<{ category: string; n: string }>(sql`
      WITH pulled AS (${pulledRuns(workspaceId)})
      SELECT f.category, count(*) AS n
      FROM pulled p
      JOIN reviews rv ON rv.run_id = p.run_id
      JOIN findings f ON f.review_id = rv.id
      WHERE p.skill_id = ${skillId}
        AND rv.created_at >= now() - make_interval(days => ${STATS_WINDOW_DAYS})
      GROUP BY f.category
      ORDER BY n DESC, f.category
    `);
    const byCategory = Array.from(categories, (r) => ({ category: r.category, count: Number(r.n) }));
    return {
      agents: usage?.agents ?? 0,
      agentRuns: usage?.agentRuns ?? 0,
      pulledRuns: usage?.pulledRuns ?? 0,
      accepted: usage?.accepted ?? 0,
      dismissed: usage?.dismissed ?? 0,
      agentList,
      findings30d: byCategory.reduce((n, c) => n + c.count, 0),
      byCategory,
    };
  }
}
