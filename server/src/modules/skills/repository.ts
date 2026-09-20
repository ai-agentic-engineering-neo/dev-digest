import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow } from '../../db/rows.js';

export type { SkillRow };

/** One `agent_skills` link with the names the stats need. */
export interface SkillLinkUsage {
  skillId: string;
  skillName: string;
  agentId: string;
  agentName: string;
  linkEnabled: boolean;
}

/** A finished run in the stats window; `skillsText` is the trace's rendered skills block. */
export interface SkillRunUsage {
  runId: string;
  agentId: string;
  skillsText: string | null;
}

export interface SkillFindingUsage {
  runId: string;
  category: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

export interface SkillUsageData {
  links: SkillLinkUsage[];
  runs: SkillRunUsage[];
  findings: SkillFindingUsage[];
}

const FINDINGS_CHUNK = 1000;

export interface NewSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillRow['type'];
  source: SkillRow['source'];
  body: string;
  enabled: boolean;
}

export interface SkillPatch {
  name?: string;
  description?: string;
  type?: SkillRow['type'];
  body?: string;
  enabled?: boolean;
}

/**
 * The only DB layer for skills. Body history (`skill_versions`) is written in the
 * same transaction as the row it belongs to, so a skill never exists without its
 * version 1 and a body change never bumps `version` without a snapshot.
 */
export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(desc(t.skills.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async findByName(workspaceId: string, name: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(
        and(eq(t.skills.workspaceId, workspaceId), sql`lower(${t.skills.name}) = lower(${name})`),
      );
    return row;
  }

  /** Which of `ids` are skills of this workspace (used to validate agent links). */
  async existingIds(workspaceId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, ids)));
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Raw material for skill stats, as plain rows (the maths lives in helpers.ts):
   * every link of this workspace's skills, the `done` runs since `since`, and the
   * findings of those runs. Every query is workspace-scoped.
   */
  async usageData(workspaceId: string, since: Date): Promise<SkillUsageData> {
    const links = await this.db
      .select({
        skillId: t.skills.id,
        skillName: t.skills.name,
        agentId: t.agents.id,
        agentName: t.agents.name,
        linkEnabled: t.agentSkills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.agents.workspaceId, workspaceId)));

    const runRows = await this.db
      .select({
        runId: t.agentRuns.id,
        agentId: t.agentRuns.agentId,
        skillsText: sql<string | null>`${t.runTraces.trace}->'prompt_assembly'->>'skills'`,
      })
      .from(t.agentRuns)
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.status, 'done'),
          gte(t.agentRuns.ranAt, since),
        ),
      );
    const runs: SkillRunUsage[] = [];
    for (const r of runRows) {
      if (r.agentId) runs.push({ runId: r.runId, agentId: r.agentId, skillsText: r.skillsText });
    }

    const findings: SkillFindingUsage[] = [];
    for (let i = 0; i < runs.length; i += FINDINGS_CHUNK) {
      const ids = runs.slice(i, i + FINDINGS_CHUNK).map((r) => r.runId);
      const rows = await this.db
        .select({
          runId: t.reviews.runId,
          category: t.findings.category,
          acceptedAt: t.findings.acceptedAt,
          dismissedAt: t.findings.dismissedAt,
        })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
        .where(and(eq(t.reviews.workspaceId, workspaceId), inArray(t.reviews.runId, ids)));
      for (const f of rows) if (f.runId) findings.push({ ...f, runId: f.runId });
    }
    return { links, runs, findings };
  }

  async insert(input: NewSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(t.skills).values({ ...input, version: 1 }).returning();
      await tx.insert(t.skillVersions).values({ skillId: row!.id, version: 1, body: input.body });
      return row!;
    });
  }

  /** Apply a patch; a changed body bumps `version` and stores a snapshot. */
  async update(workspaceId: string, id: string, patch: SkillPatch): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!current) return undefined;
      const bodyChanged = patch.body !== undefined && patch.body !== current.body;
      const version = bodyChanged ? current.version + 1 : current.version;
      const [row] = await tx
        .update(t.skills)
        .set({ ...patch, version })
        .where(eq(t.skills.id, id))
        .returning();
      if (bodyChanged) {
        await tx.insert(t.skillVersions).values({ skillId: id, version, body: patch.body! });
      }
      return row;
    });
  }

  /** Delete a skill (agent links and versions cascade). False when it did not exist. */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }
}
