import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { isSkillConfigChange } from './helpers.js';

/**
 * A1 — skills data-access. Owns `skills` and `skill_versions`; reads
 * `agent_skills` (A2 owns the write side) and `agent_runs`/`run_traces`/
 * `reviews`/`findings` for S10 stats. Every read/write is workspace-scoped
 * (S7). Config-changing writes (S4) run inside `db.transaction` — the first
 * `db.transaction()` calls in this codebase (server/INSIGHTS.md).
 */

export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  note?: string;
  evidenceFiles?: string[];
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  note?: string;
}

export interface SkillAgent {
  id: string;
  name: string;
}

export interface FindingForStats {
  category: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
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

  /** Delete a skill (scoped to workspace). skill_versions and agent_skills cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /**
   * Insert a skill AND its version-1 snapshot in one transaction.
   *
   * NOTE: the `skills.source` DB column's Drizzle enum hint still lists only
   * the 4 original values (the schema is "unchanged" per spec) while the
   * contract's `SkillSource` now also has `imported_file`; the column itself
   * is plain `text` with no Postgres CHECK constraint (see migration 0000), so
   * writing that value is safe at runtime — only Drizzle's TS-level union
   * needs the cast below. See server/INSIGHTS.md.
   */
  async insert(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source as typeof t.skills.$inferInsert.source,
          body: values.body,
          enabled: values.enabled,
          version: 1,
          evidenceFiles: values.evidenceFiles ?? null,
        })
        .returning();
      await tx.insert(t.skillVersions).values({
        skillId: row!.id,
        version: 1,
        body: row!.body,
        note: values.note ?? null,
      });
      return row!;
    });
  }

  /**
   * Update a skill. A change to name/description/type/body (S4) bumps the
   * version and snapshots the new body into skill_versions in the SAME
   * transaction; toggling `enabled` alone does neither.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
      if (!existing) return undefined;

      const configChanged = isSkillConfigChange(existing, patch);
      const nextVersion = configChanged ? existing.version + 1 : existing.version;

      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(configChanged ? { version: nextVersion } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();

      if (configChanged && row) {
        await tx.insert(t.skillVersions).values({
          skillId: row.id,
          version: nextVersion,
          body: row.body,
          note: patch.note ?? null,
        });
      }
      return row;
    });
  }

  // ---- skill_versions (immutable history) ----------------------------------

  /** All version snapshots for a skill, newest first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** A single version snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  // ---- GET /skills list-card aggregates -------------------------------------

  /**
   * Total linked-agent count per skill (enabled or not — "N agents use this"
   * list material, mirrors `agents.countSkillsByAgentIds`'s convention).
   */
  async agentCountsBySkillIds(workspaceId: string, skillIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (skillIds.length === 0) return counts;
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, n: count() })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(inArray(t.agentSkills.skillId, skillIds), eq(t.agents.workspaceId, workspaceId)))
      .groupBy(t.agentSkills.skillId);
    for (const row of rows) counts.set(row.skillId, row.n);
    return counts;
  }

  // ---- S10 stats --------------------------------------------------------

  /** Agents with an ENABLED link to this skill — S10 `used_by`/`agents`. */
  async linkedEnabledAgents(workspaceId: string, skillId: string): Promise<SkillAgent[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(
        and(
          eq(t.agentSkills.skillId, skillId),
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentSkills.enabled, true),
        ),
      );
  }

  /** ALL agents linked to this skill (any `enabled` state) — the pull/accept-rate population. */
  async linkedAgentIds(workspaceId: string, skillId: string): Promise<string[]> {
    const rows = await this.db
      .select({ agentId: t.agentSkills.agentId })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)));
    return rows.map((r) => r.agentId);
  }

  /** All `agent_runs` in the 30-day window belonging to `agentIds` — pull_rate's denominator. */
  async totalRuns(workspaceId: string, agentIds: string[], since: Date): Promise<number> {
    if (agentIds.length === 0) return 0;
    const [row] = await this.db
      .select({ n: count() })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.agentId, agentIds),
          gte(t.agentRuns.ranAt, since),
        ),
      );
    return row!.n;
  }

  /**
   * Run ids among `agentIds` whose trace records THIS skill in
   * `prompt_assembly.skills_used` (jsonb containment) — pull_rate's numerator,
   * and the run set accept_rate/findings_30d/by_category are computed over.
   * A trace with no `skills_used` key at all (pre-S9 traces) simply never
   * matches the containment check — it does not throw.
   */
  async usedRunIds(
    workspaceId: string,
    agentIds: string[],
    skillId: string,
    since: Date,
  ): Promise<string[]> {
    if (agentIds.length === 0) return [];
    const rows = await this.db
      .select({ id: t.agentRuns.id })
      .from(t.agentRuns)
      .innerJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.agentId, agentIds),
          gte(t.agentRuns.ranAt, since),
          sql`${t.runTraces.trace} -> 'prompt_assembly' -> 'skills_used' @> ${JSON.stringify([{ id: skillId }])}::jsonb`,
        ),
      );
    return rows.map((r) => r.id);
  }

  /**
   * Findings over `runIds`, joined through reviews — `findings` has no
   * `workspace_id` of its own (server/INSIGHTS.md); tenancy reaches it only
   * via `reviews.workspace_id`, and `reviews.run_id` is how a finding ties
   * back to the run set computed above.
   */
  async findingsForRuns(workspaceId: string, runIds: string[]): Promise<FindingForStats[]> {
    if (runIds.length === 0) return [];
    return this.db
      .select({
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), inArray(t.reviews.runId, runIds)));
  }
}
