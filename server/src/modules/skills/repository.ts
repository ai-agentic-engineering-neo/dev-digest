import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { INITIAL_SKILL_VERSION, STATS_WINDOW_DAYS } from './constants.js';

/**
 * Skills data-access. Owns `skills`, `skill_versions` and `run_skills`, plus the
 * stats queries behind the rail footer and the Stats tab. Workspace-scoped
 * throughout: every read and write is keyed by `workspaceId` so a skill can
 * never be reached across tenants.
 *
 * The agent side of `agent_skills` (link / reorder / toggle) stays in
 * `AgentsRepository`; this module only READS that table, for "who uses this".
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
  enabled?: boolean;
  /** File:line citations backing this skill — populated by the Conventions
   *  extractor; every other creation path leaves this null. */
  evidenceFiles?: string[];
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body?: string;
  enabled?: boolean;
}

/** One row of the `run_skills` write the run executor performs at assembly time. */
export interface InjectedSkill {
  skillId: string;
  order: number;
  tokens: number;
}

/**
 * The four measured facts behind the Stats tab.
 *
 * `null` is load-bearing everywhere it appears: it means UNMEASURED (no runs
 * yet, nothing judged yet) and the UI renders it as "—". A measured zero is a
 * different fact and stays `0`. Never collapse one into the other.
 */
export interface SkillStatsRow {
  usedBy: number;
  agents: Array<{ id: string; name: string }>;
  pullPct: number | null;
  acceptPct: number | null;
  findings: number;
  byCategory: Array<{ category: string; count: number }>;
  avgTokens: number | null;
}

/** The cheap subset shown on a rail card, batched for the whole list. */
export interface SkillListStatsRow {
  usedBy: number;
  pullPct: number | null;
  acceptPct: number | null;
}

/** Postgres unique-violation. A name collision must not surface as a raw 500. */
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === PG_UNIQUE_VIOLATION;
}

/** `accepted / (accepted + dismissed)`; null when nothing has been judged. */
function ratePct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100);
}

/**
 * The 30-day window shared by the findings tile, the accept rate and the
 * category donut. `sql.raw` is safe here and only here: `STATS_WINDOW_DAYS` is a
 * module constant, never request input — and Postgres will not accept a bound
 * parameter inside an interval literal.
 */
const withinStatsWindow = sql`${t.agentRuns.ranAt} >= now() - ${sql.raw(
  `interval '${STATS_WINDOW_DAYS} days'`,
)}`;

export class SkillsRepository {
  constructor(private db: Db) {}

  // ---- skills -------------------------------------------------------------

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

  /** Name lookup for the collision check (names are unique per workspace). */
  async getByName(workspaceId: string, name: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row;
  }

  async insert(values: InsertSkill): Promise<SkillRow> {
    try {
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
          version: INITIAL_SKILL_VERSION,
          evidenceFiles: values.evidenceFiles ?? null,
        })
        .returning();
      return row!;
    } catch (err) {
      throw this.translateNameCollision(err, values.name);
    }
  }

  /**
   * Update a skill, archiving the PREVIOUS body when — and only when — the body
   * actually changed. Renaming or rewording does not mint a version.
   *
   * The archive-then-bump pair runs in one transaction so `skill_versions` can
   * never hold a snapshot for a version the skill never reached (or miss one it
   * did). Mirrors `AgentsRepository.snapshotVersion`, with the opposite polarity:
   * agents snapshot the NEW config at the new version, skills archive the OLD
   * body at the old version, because the current body already lives on the row.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
    opts: { bumpVersion: boolean },
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const nextVersion = opts.bumpVersion ? existing.version + 1 : existing.version;
    try {
      return await this.db.transaction(async (tx) => {
        if (opts.bumpVersion) {
          await tx
            .insert(t.skillVersions)
            .values({ skillId: id, version: existing.version, body: existing.body })
            .onConflictDoNothing();
        }
        const [row] = await tx
          .update(t.skills)
          .set({
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.description !== undefined ? { description: patch.description } : {}),
            ...(patch.type !== undefined ? { type: patch.type } : {}),
            ...(patch.source !== undefined ? { source: patch.source } : {}),
            ...(patch.body !== undefined ? { body: patch.body } : {}),
            ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
            ...(opts.bumpVersion ? { version: nextVersion } : {}),
          })
          .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
          .returning();
        return row;
      });
    } catch (err) {
      throw this.translateNameCollision(err, patch.name ?? existing.name);
    }
  }

  /** Delete a skill. `agent_skills` and `run_skills` cascade (FK ON DELETE CASCADE),
   *  so a deleted skill leaves no dangling link and no orphan stats row. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /**
   * The workspace-unique index (`skills_ws_name_uq`) is the real guard — the
   * service's pre-check narrows the race, this closes it. Translated at the
   * persistence boundary so the route can render an inline field error instead
   * of a Postgres string.
   */
  private translateNameCollision(err: unknown, name: string): unknown {
    if (!isUniqueViolation(err)) return err;
    return new ValidationError(`A skill named "${name}" already exists in this workspace`, {
      field: 'name',
      name,
    });
  }

  // ---- skill_versions (archived bodies) -----------------------------------

  /** Archived bodies for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** One archived body, or undefined when that version was never superseded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  // ---- run_skills (what a run actually injected) --------------------------

  /**
   * Record the skills one run injected. Written by the run executor at prompt
   * assembly time — NOT derived from `agent_skills`, because links get toggled
   * afterwards and this table has to keep saying what was true at run time.
   */
  async recordRunSkills(runId: string, injected: InjectedSkill[]): Promise<void> {
    if (injected.length === 0) return;
    await this.db
      .insert(t.runSkills)
      .values(
        injected.map((s) => ({
          runId,
          skillId: s.skillId,
          order: s.order,
          tokens: s.tokens,
        })),
      )
      .onConflictDoNothing();
  }

  // ---- stats --------------------------------------------------------------

  /** Full Stats-tab payload for one skill. */
  async statsFor(workspaceId: string, skillId: string): Promise<SkillStatsRow> {
    const [agents, pull, findings, byCategory, avgTokens] = await Promise.all([
      this.agentsUsing(workspaceId, skillId),
      this.pullCounts(workspaceId, [skillId]),
      this.findingCounts(workspaceId, [skillId]),
      this.findingsByCategory(workspaceId, skillId),
      this.avgTokensBySkill([skillId]),
    ]);

    const p = pull.get(skillId);
    const f = findings.get(skillId);
    return {
      usedBy: agents.length,
      agents,
      pullPct: p && p.denominator > 0 ? ratePct(p.numerator, p.denominator) : null,
      acceptPct: ratePct(f?.accepted ?? 0, (f?.accepted ?? 0) + (f?.dismissed ?? 0)),
      findings: f?.total ?? 0,
      byCategory,
      avgTokens: avgTokens.get(skillId) ?? null,
    };
  }

  /**
   * Rail-card stats for MANY skills in three grouped queries — never one query
   * per card. A workspace with 40 skills costs the same as one with 2.
   */
  async listStats(
    workspaceId: string,
    skillIds: string[],
  ): Promise<Map<string, SkillListStatsRow>> {
    const out = new Map<string, SkillListStatsRow>();
    if (skillIds.length === 0) return out;

    const [usedBy, pull, findings] = await Promise.all([
      this.usedByCounts(skillIds),
      this.pullCounts(workspaceId, skillIds),
      this.findingCounts(workspaceId, skillIds),
    ]);

    for (const id of skillIds) {
      const p = pull.get(id);
      const f = findings.get(id);
      out.set(id, {
        usedBy: usedBy.get(id) ?? 0,
        pullPct: p && p.denominator > 0 ? ratePct(p.numerator, p.denominator) : null,
        acceptPct: ratePct(f?.accepted ?? 0, (f?.accepted ?? 0) + (f?.dismissed ?? 0)),
      });
    }
    return out;
  }

  /**
   * USED BY — the agents that would actually pull this skill: a link exists AND
   * the per-agent gate is on. (The workspace gate lives on the skill itself and
   * is shown separately, so a disabled skill still reports who has it attached.)
   */
  private async agentsUsing(
    workspaceId: string,
    skillId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.db
      .selectDistinct({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(
        and(
          eq(t.agentSkills.skillId, skillId),
          eq(t.agentSkills.enabled, true),
          eq(t.agents.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(t.agents.name));
  }

  /** Batched USED BY counts. */
  private async usedByCounts(skillIds: string[]): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        skillId: t.agentSkills.skillId,
        count: sql<number>`count(distinct ${t.agentSkills.agentId})::int`,
      })
      .from(t.agentSkills)
      .where(and(inArray(t.agentSkills.skillId, skillIds), eq(t.agentSkills.enabled, true)))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, r.count]));
  }

  /**
   * PULL FREQUENCY, both halves in one grouped query.
   *
   *   denominator = `done` agent_runs of the agents CURRENTLY linked to the skill
   *   numerator   = of those, the ones that have a `run_skills` row for it
   *
   * Historical by design: skills get toggled over time, so this answers "how
   * often did this skill actually reach a prompt", not "is it switched on now".
   * The LEFT JOIN is what lets one pass produce both counts — a run by a linked
   * agent that never injected the skill still lands in the denominator.
   */
  private async pullCounts(
    workspaceId: string,
    skillIds: string[],
  ): Promise<Map<string, { numerator: number; denominator: number }>> {
    const rows = await this.db
      .select({
        skillId: t.agentSkills.skillId,
        denominator: sql<number>`count(*)::int`,
        numerator: sql<number>`count(*) filter (where ${t.runSkills.runId} is not null)::int`,
      })
      .from(t.agentSkills)
      .innerJoin(
        t.agentRuns,
        and(
          eq(t.agentRuns.agentId, t.agentSkills.agentId),
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.status, 'done'),
        ),
      )
      .leftJoin(
        t.runSkills,
        and(
          eq(t.runSkills.runId, t.agentRuns.id),
          eq(t.runSkills.skillId, t.agentSkills.skillId),
        ),
      )
      .where(inArray(t.agentSkills.skillId, skillIds))
      .groupBy(t.agentSkills.skillId);
    return new Map(
      rows.map((r) => [r.skillId, { numerator: r.numerator, denominator: r.denominator }]),
    );
  }

  /**
   * FINDINGS (30D) + ACCEPT RATE, batched.
   *
   * Attribution is RUN-level: a run that injected four skills counts its
   * findings toward all four. That over-counts and the UI says so — the panel
   * is titled "findings in runs using this skill", never "caused by".
   *
   * Unjudged findings are excluded from BOTH sides of the accept rate; a fresh
   * workspace must read "—", not a misleading 0%.
   */
  private async findingCounts(
    workspaceId: string,
    skillIds: string[],
  ): Promise<Map<string, { total: number; accepted: number; dismissed: number }>> {
    const rows = await this.db
      .select({
        skillId: t.runSkills.skillId,
        total: sql<number>`count(*)::int`,
        accepted: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)::int`,
        dismissed: sql<number>`count(*) filter (where ${t.findings.dismissedAt} is not null)::int`,
      })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .innerJoin(t.reviews, eq(t.reviews.runId, t.runSkills.runId))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          inArray(t.runSkills.skillId, skillIds),
          eq(t.agentRuns.workspaceId, workspaceId),
          withinStatsWindow,
        ),
      )
      .groupBy(t.runSkills.skillId);
    return new Map(
      rows.map((r) => [
        r.skillId,
        { total: r.total, accepted: r.accepted, dismissed: r.dismissed },
      ]),
    );
  }

  /** The same 30-day finding set as `findingCounts`, grouped by category — as
   *  COUNTS. (The mockup renders these through a currency formatter; they are
   *  findings, not money.) */
  private async findingsByCategory(
    workspaceId: string,
    skillId: string,
  ): Promise<Array<{ category: string; count: number }>> {
    return this.db
      .select({ category: t.findings.category, count: sql<number>`count(*)::int` })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .innerJoin(t.reviews, eq(t.reviews.runId, t.runSkills.runId))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          eq(t.runSkills.skillId, skillId),
          eq(t.agentRuns.workspaceId, workspaceId),
          withinStatsWindow,
        ),
      )
      .groupBy(t.findings.category)
      .orderBy(desc(sql`count(*)`));
  }

  /** TOKENS / RUN — the real tokenizer count the executor recorded, averaged.
   *  Absent (null) when the skill has never been injected. */
  private async avgTokensBySkill(skillIds: string[]): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        skillId: t.runSkills.skillId,
        avg: sql<number>`round(avg(${t.runSkills.tokens}))::int`,
      })
      .from(t.runSkills)
      .where(inArray(t.runSkills.skillId, skillIds))
      .groupBy(t.runSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, r.avg]));
  }
}
