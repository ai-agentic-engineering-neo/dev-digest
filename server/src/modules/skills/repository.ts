import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { ConflictError } from '../../platform/errors.js';
import { isSkillConfigChange } from './helpers.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`, and joins into
 * `agent_skills` / `agents` / `agent_runs` / `reviews` / `findings` for the
 * reverse ("used by") and Stats (§7.2) queries — repository.ts is the
 * persistence layer, not restricted to only "its own" tables (AgentsRepository
 * already joins `skills` the same way). Every query is workspace-scoped.
 */
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface UpdateSkillOptions {
  /** Author's optional note for the new `skill_versions` row, NULL when blank. */
  versionMessage?: string | null;
  /** Restore (§5.2) always writes forward, even if the restored body happens
   *  to equal the current one — force the bump regardless of the predicate. */
  forceBump?: boolean;
}

export interface SkillWithUsage {
  skill: SkillRow;
  usedBy: number;
}

export interface AgentLink {
  id: string;
  name: string;
}

export interface FindingWindowRow {
  category: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

/** Postgres unique_violation — translated to a ConflictError at this ring boundary. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505';
}

export class SkillsRepository {
  constructor(private db: Db) {}

  /** Every skill name in the workspace — used to de-dupe an import preview's slug. */
  async listNames(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: t.skills.name })
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId));
    return rows.map((r) => r.name);
  }

  /** All skills with their `used_by` link count (the rail's list view). */
  async listWithUsage(workspaceId: string): Promise<SkillWithUsage[]> {
    return this.db
      .select({
        skill: t.skills,
        usedBy: sql<number>`count(distinct ${t.agentSkills.agentId})`.mapWith(Number),
      })
      .from(t.skills)
      .leftJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.skills.id);
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Insert a skill AND record version 1 in `skill_versions` (mirrors AgentsRepository). */
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
        })
        .returning();
      await this.db.insert(t.skillVersions).values({
        skillId: row!.id,
        version: row!.version,
        body: row!.body,
        message: null,
      });
      return row!;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(`A skill named "${values.name}" already exists in this workspace`);
      }
      throw err;
    }
  }

  /**
   * Update a skill. A change to name/description/type/body (or `forceBump`)
   * bumps `version` and inserts a `skill_versions` row; toggling `enabled`
   * alone bumps neither.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillPatch,
    options: UpdateSkillOptions = {},
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const configChanged = options.forceBump === true || isSkillConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    try {
      const [row] = await this.db
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
        await this.db.insert(t.skillVersions).values({
          skillId: row.id,
          version: nextVersion,
          body: row.body,
          message: options.versionMessage ?? null,
        });
      }
      return row;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          `A skill named "${patch.name ?? ''}" already exists in this workspace`,
        );
      }
      throw err;
    }
  }

  /** Hard delete. `agent_skills` / `agent_run_skills` cascade via FK. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Version history, newest first. */
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

  /** Agents currently linking a skill — the delete-confirmation and the Stats "AGENTS" tile. */
  async agentsUsingSkill(workspaceId: string, skillId: string): Promise<AgentLink[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)));
  }

  /** Distinct runs (within the window) that had this skill attached. */
  async countRunsWithSkill(workspaceId: string, skillId: string, since: Date): Promise<number> {
    const rows = await this.db
      .selectDistinct({ runId: t.agentRunSkills.runId })
      .from(t.agentRunSkills)
      .innerJoin(t.agentRuns, eq(t.agentRunSkills.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRunSkills.skillId, skillId),
          eq(t.agentRuns.workspaceId, workspaceId),
          gte(t.agentRuns.ranAt, since),
        ),
      );
    return rows.length;
  }

  /** Runs (within the window) by agents currently linked to this skill. */
  async countRunsByAgents(workspaceId: string, agentIds: string[], since: Date): Promise<number> {
    if (agentIds.length === 0) return 0;
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.agentId, agentIds),
          gte(t.agentRuns.ranAt, since),
        ),
      );
    return row?.count ?? 0;
  }

  /** Findings from runs (within the window) that had this skill attached. */
  async findingRowsForSkillWindow(
    workspaceId: string,
    skillId: string,
    since: Date,
  ): Promise<FindingWindowRow[]> {
    return this.db
      .select({
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.agentRunSkills)
      .innerJoin(t.agentRuns, eq(t.agentRunSkills.runId, t.agentRuns.id))
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          eq(t.agentRunSkills.skillId, skillId),
          eq(t.agentRuns.workspaceId, workspaceId),
          gte(t.agentRuns.ranAt, since),
        ),
      );
  }
}
