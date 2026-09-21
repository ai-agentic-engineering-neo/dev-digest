import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import {
  DEFAULT_SKILL_DESCRIPTION,
  FINDINGS_WINDOW_DAYS,
  INITIAL_SKILL_VERSION,
} from './constants.js';
import { EMPTY_USAGE, isBodyChange } from './helpers.js';
import type {
  InsertSkill,
  SkillRecord,
  SkillsStore,
  SkillUsageCounts,
  SkillVersionRecord,
  UpdateSkill,
} from './types.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`, and reads the
 * `agent_skills` / `agent_run_skills` / `agent_runs` / `reviews` / `findings`
 * tables for usage stats. Workspace-scoped throughout.
 */
export class SkillsRepository implements SkillsStore {
  constructor(private db: Db) {}

  /** Oldest first, then by name. */
  async list(workspaceId: string): Promise<SkillRecord[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.createdAt), asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). skill_versions / agent_skills /
   *  agent_run_skills cascade. Returns false if no such skill existed. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in skill_versions (immutable snapshot). */
  async insert(values: InsertSkill): Promise<SkillRecord> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description ?? DEFAULT_SKILL_DESCRIPTION,
          type: values.type,
          source: values.source ?? 'manual',
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
        })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: row!.body });
      return row!;
    });
  }

  /**
   * Update a skill. Only a real `body` change bumps `version` and snapshots the
   * new body into skill_versions; name/description/type/enabled edits never do.
   * Runs in one transaction with the row locked so concurrent body edits can't
   * collide on the same version number.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRecord | undefined> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;

      const bodyChanged = isBodyChange(existing, patch);
      const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

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

      if (bodyChanged && row) {
        await tx
          .insert(t.skillVersions)
          .values({ skillId: row.id, version: nextVersion, body: row.body })
          .onConflictDoNothing();
      }
      return row;
    });
  }

  // ---- skill_versions (immutable body snapshots) --------------------------

  /** All body snapshots for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRecord[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** A single snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  // ---- usage stats --------------------------------------------------------

  /**
   * Raw usage counts for many skills in a fixed number of queries (5), keyed by
   * skill id. Skills nothing has touched map to zeroed counts. Rates are derived
   * (and divide-by-zero guarded) in helpers.
   *
   * Findings are not attributed to a specific skill (the model doesn't say which
   * skill triggered which finding), so accept-rate / findings_30d / by-category
   * are over findings of runs in which the skill was active (`agent_run_skills`).
   */
  async statsForSkills(skillIds: string[]): Promise<Map<string, SkillUsageCounts>> {
    const out = new Map<string, SkillUsageCounts>();
    if (skillIds.length === 0) return out;
    for (const id of skillIds) out.set(id, { ...EMPTY_USAGE, agentsUsing: [], findingsByCategory: [] });

    // 1. Agents currently linking each skill (-> used_by + agents_using).
    const linked = await this.db
      .select({ skillId: t.agentSkills.skillId, id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(inArray(t.agentSkills.skillId, skillIds))
      .orderBy(asc(t.agents.name), asc(t.agents.id));
    for (const r of linked) {
      const c = out.get(r.skillId)!;
      c.agentsUsing.push({ id: r.id, name: r.name });
      c.usedBy = c.agentsUsing.length;
    }

    // 2. Pull-rate: done runs by agents that currently link the skill (denominator),
    //    and how many of those have an agent_run_skills row for it (numerator).
    const pulled = await this.db
      .select({
        skillId: t.agentSkills.skillId,
        eligible: sql<number>`count(${t.agentRuns.id})`.mapWith(Number),
        pulled: sql<number>`count(${t.agentRunSkills.agentRunId})`.mapWith(Number),
      })
      .from(t.agentSkills)
      .innerJoin(
        t.agentRuns,
        and(eq(t.agentRuns.agentId, t.agentSkills.agentId), eq(t.agentRuns.status, 'done')),
      )
      .leftJoin(
        t.agentRunSkills,
        and(
          eq(t.agentRunSkills.agentRunId, t.agentRuns.id),
          eq(t.agentRunSkills.skillId, t.agentSkills.skillId),
        ),
      )
      .where(inArray(t.agentSkills.skillId, skillIds))
      .groupBy(t.agentSkills.skillId);
    for (const r of pulled) {
      const c = out.get(r.skillId)!;
      c.eligibleRuns = r.eligible;
      c.pulledRuns = r.pulled;
    }

    // 3. Accept-rate + findings_30d over findings of runs where the skill was active.
    const cutoff = sql`now() - make_interval(days => ${FINDINGS_WINDOW_DAYS})`;
    const findingStats = await this.db
      .select({
        skillId: t.agentRunSkills.skillId,
        accepted: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)`.mapWith(
          Number,
        ),
        decided:
          sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null or ${t.findings.dismissedAt} is not null)`.mapWith(
            Number,
          ),
        recent: sql<number>`count(*) filter (where ${t.reviews.createdAt} >= ${cutoff})`.mapWith(
          Number,
        ),
      })
      .from(t.agentRunSkills)
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRunSkills.agentRunId))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(inArray(t.agentRunSkills.skillId, skillIds))
      .groupBy(t.agentRunSkills.skillId);
    for (const r of findingStats) {
      const c = out.get(r.skillId)!;
      c.accepted = r.accepted;
      c.decided = r.decided;
      c.findings30d = r.recent;
    }

    // 4. Findings by category: cost summed once per DISTINCT run that produced >=1
    //    finding of the category. Caveat: a run with findings in several categories
    //    counts its full cost in each of them.
    const runCategories = this.db
      .selectDistinct({
        skillId: t.agentRunSkills.skillId,
        runId: t.agentRunSkills.agentRunId,
        category: t.findings.category,
      })
      .from(t.agentRunSkills)
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRunSkills.agentRunId))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(inArray(t.agentRunSkills.skillId, skillIds))
      .as('run_categories');
    const byCategory = await this.db
      .select({
        skillId: runCategories.skillId,
        category: runCategories.category,
        cost: sql<number>`coalesce(sum(${t.agentRuns.costUsd}), 0)`.mapWith(Number),
      })
      .from(runCategories)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, runCategories.runId))
      .groupBy(runCategories.skillId, runCategories.category);
    for (const r of byCategory) {
      out.get(r.skillId)!.findingsByCategory.push({ category: r.category, cost_usd: r.cost });
    }
    for (const c of out.values()) {
      c.findingsByCategory.sort(
        (a, b) => b.cost_usd - a.cost_usd || a.category.localeCompare(b.category),
      );
    }

    return out;
  }
}
