/**
 * Skills data access (infrastructure; implements SkillsReader + SkillsWriter).
 * Owns `skills`, `skill_versions`, and the skill-side reads of `agent_skills`,
 * `agent_run_skills` and `findings` for stats. Workspace-scoped throughout.
 * Transactions are opened by the use case (TransactionRunner, composition.ts
 * binds a SkillsRepository to the tx handle).
 */
import { and, asc, count, desc, eq, gte, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { CountBy, Skill, SkillAgentRef, SkillVersion } from '@devdigest/shared';
import type { DbOrTx } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { ConflictError } from '../../../platform/errors.js';
import type { SkillsReader, SkillsWriter } from '../application/ports.js';
import type { NewSkill, NewSkillVersion, SkillCounters, SkillWrite } from '../domain/types.js';
import { toSkillDto, toSkillVersionDto } from './mappers.js';

/** Number of agents linking a skill, computed on read. */
const usedBy = sql<number>`(select count(*)::int from ${t.agentSkills} where ${t.agentSkills.skillId} = ${t.skills.id})`;

/** pg SQLSTATE of a driver error (Drizzle wraps it: the code is on `cause`). */
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

/** Translate a unique violation on the (workspace, name) key into a 409. */
async function uniqueName<T>(name: string | undefined, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (pgCode(err) === '23505') {
      throw new ConflictError(`A skill named "${name}" already exists in this workspace`, undefined, 'conflict');
    }
    throw err;
  }
}

export class SkillsRepository implements SkillsReader, SkillsWriter {
  constructor(private readonly db: DbOrTx) {}

  private scoped(workspaceId: string, id: string): SQL {
    return and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id))!;
  }

  // ---- reads ----------------------------------------------------------------

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.db
      .select({ skill: t.skills, usedBy })
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      // Byte order: slugs are ASCII, and a locale collation would ignore the dashes.
      .orderBy(sql`${t.skills.name} collate "C"`);
    return rows.map((r) => toSkillDto(r.skill, r.usedBy));
  }

  async find(workspaceId: string, id: string): Promise<Skill | undefined> {
    const [row] = await this.db.select({ skill: t.skills, usedBy }).from(t.skills).where(this.scoped(workspaceId, id));
    return row && toSkillDto(row.skill, row.usedBy);
  }

  async listVersions(skillId: string): Promise<SkillVersion[]> {
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map(toSkillVersionDto);
  }

  async findVersion(skillId: string, version: number): Promise<SkillVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row && toSkillVersionDto(row);
  }

  async agentsUsing(skillId: string): Promise<SkillAgentRef[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(eq(t.agentSkills.skillId, skillId))
      .orderBy(asc(t.agents.name));
  }

  /**
   * Stats counters per skill since `since`. Only runs that finished (`done`)
   * count as "attached": a failed/cancelled run says nothing about the skill.
   * Findings are windowed by their review's creation time.
   */
  async counters(workspaceId: string, since: Date, skillId?: string): Promise<Map<string, SkillCounters>> {
    const onlySkill = (col: typeof t.agentRunSkills.skillId | typeof t.findings.skillId) =>
      skillId ? [eq(col, skillId)] : [];
    const doneSince = [eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.status, 'done'), gte(t.agentRuns.ranAt, since)];

    const [attached, cited, findings] = await Promise.all([
      this.db
        .select({ skillId: t.agentRunSkills.skillId, n: sql<number>`count(distinct ${t.agentRunSkills.runId})::int` })
        .from(t.agentRunSkills)
        .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.agentRunSkills.runId))
        .where(and(...doneSince, ...onlySkill(t.agentRunSkills.skillId)))
        .groupBy(t.agentRunSkills.skillId),
      // A run "cites" a skill when one of its kept findings resolved to it.
      this.db
        .select({ skillId: t.findings.skillId, n: sql<number>`count(distinct ${t.reviews.runId})::int` })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
        .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
        .innerJoin(
          t.agentRunSkills,
          and(eq(t.agentRunSkills.runId, t.reviews.runId), eq(t.agentRunSkills.skillId, t.findings.skillId)),
        )
        .where(and(...doneSince, ...onlySkill(t.findings.skillId)))
        .groupBy(t.findings.skillId),
      this.db
        .select({
          skillId: t.findings.skillId,
          n: count(),
          accepted: count(t.findings.acceptedAt),
          dismissed: count(t.findings.dismissedAt),
        })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
        .where(
          and(
            eq(t.reviews.workspaceId, workspaceId),
            isNotNull(t.findings.skillId),
            gte(t.reviews.createdAt, since),
            ...onlySkill(t.findings.skillId),
          ),
        )
        .groupBy(t.findings.skillId),
    ]);

    const out = new Map<string, SkillCounters>();
    const at = (id: string): SkillCounters => {
      const existing = out.get(id);
      if (existing) return existing;
      const fresh = { runsAttached: 0, runsCited: 0, findings: 0, accepted: 0, dismissed: 0 };
      out.set(id, fresh);
      return fresh;
    };
    for (const r of attached) at(r.skillId).runsAttached = r.n;
    for (const r of cited) if (r.skillId) at(r.skillId).runsCited = r.n;
    for (const r of findings) {
      if (!r.skillId) continue;
      Object.assign(at(r.skillId), { findings: r.n, accepted: r.accepted, dismissed: r.dismissed });
    }
    return out;
  }

  async breakdown(
    workspaceId: string,
    skillId: string,
    since: Date,
  ): Promise<{ byCategory: CountBy[]; bySeverity: CountBy[] }> {
    const where = and(
      eq(t.reviews.workspaceId, workspaceId),
      eq(t.findings.skillId, skillId),
      gte(t.reviews.createdAt, since),
    );
    const group = (col: typeof t.findings.category | typeof t.findings.severity) =>
      this.db
        .select({ key: col, count: count() })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
        .where(where)
        .groupBy(col)
        .orderBy(desc(count()), asc(col));
    const [byCategory, bySeverity] = await Promise.all([group(t.findings.category), group(t.findings.severity)]);
    return { byCategory, bySeverity };
  }

  // ---- writes (called inside the use case's transaction) ------------------------

  async insert(values: NewSkill): Promise<Skill> {
    const [row] = await uniqueName(values.name, () =>
      this.db
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source,
          sourceRef: values.sourceRef,
          body: values.body,
          enabled: values.enabled,
          version: 1,
        })
        .returning(),
    );
    return toSkillDto(row!, 0);
  }

  async lockForUpdate(workspaceId: string, id: string): Promise<Skill | undefined> {
    const [row] = await this.db.select().from(t.skills).where(this.scoped(workspaceId, id)).for('update');
    return row && toSkillDto(row, 0);
  }

  async write(workspaceId: string, id: string, values: SkillWrite): Promise<Skill> {
    await uniqueName(values.name, () =>
      this.db
        .update(t.skills)
        .set({ ...values, updatedAt: new Date() })
        .where(this.scoped(workspaceId, id)),
    );
    const skill = await this.find(workspaceId, id);
    if (!skill) throw new Error(`skill ${id} vanished inside its own transaction`);
    return skill;
  }

  async insertVersion(values: NewSkillVersion): Promise<void> {
    await this.db.insert(t.skillVersions).values(values);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db.delete(t.skills).where(this.scoped(workspaceId, id)).returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async deleteEvalCases(workspaceId: string, skillId: string): Promise<void> {
    await this.db
      .delete(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'skill'),
          eq(t.evalCases.ownerId, skillId),
        ),
      );
  }
}
