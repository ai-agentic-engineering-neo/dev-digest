import { and, asc, count, countDistinct, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import type { Skill, SkillSource, SkillType, SkillUsage, SkillVersion } from '@devdigest/shared';
import type { DbExecutor, DbTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { ConflictError } from './errors.js';
import {
  DONE_RUN_STATUS,
  INITIAL_SKILL_VERSION,
  MANUAL_SOURCE,
} from './constants.js';
import {
  isBodyChange,
  isUniqueViolation,
  toSkillDto,
  toSkillVersionDto,
  versionMessage,
  type AgentActivityCounts,
} from './helpers.js';

/**
 * Skills data access. Owns `skills` + `skill_versions`; reads `agent_skills`,
 * `agents`, `agent_runs`, `reviews`, `findings` for usage and stats.
 *
 * Every method takes `workspaceId` and scopes by it, so another workspace's
 * skill is simply "not found". Each write + version snapshot runs in ONE
 * transaction (atomic repository). Rows are mapped to contract DTOs here and
 * never leave this file.
 */

type Tx = DbTx;
type Executor = DbExecutor;

export interface InsertSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  /** Provenance; `manual` unless another feature creates it (e.g. `extracted`). */
  source?: SkillSource;
  /** Repo files the skill was derived from (Conventions Extractor). */
  evidenceFiles?: string[];
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  /** "What changed?" — used only when the body changes. */
  message?: string;
  /** Replace `evidence_files` (Conventions Extractor merge). Internal, not in the API. */
  evidenceFiles?: string[];
  /**
   * Optimistic check: the version the caller based its new body on. A
   * different current version (someone saved meanwhile) → 409. Internal.
   */
  expectedVersion?: number;
}

/** Outcome of a restore: the service maps the failure kinds to 404 / 409. */
export type RestoreResult =
  | { kind: 'ok'; skill: Skill }
  | { kind: 'skill_not_found' }
  | { kind: 'version_not_found' }
  | { kind: 'is_current' };

/** An agent the skill is attached to, with the agent's own enabled flag. */
export interface SkillAgentRef extends SkillUsage {
  enabled: boolean;
}

export class SkillsRepository {
  /** On a transaction handle every method joins it (own transactions become savepoints). */
  constructor(private readonly db: Executor) {}

  /** Skills in the workspace, name asc, each with its agent count (one grouped query). */
  async list(workspaceId: string): Promise<Skill[]> {
    return this.selectWithCounts(this.db, eq(t.skills.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<Skill | undefined> {
    const [skill] = await this.selectWithCounts(this.db, this.scope(workspaceId, id));
    return skill;
  }

  /** Insert a skill (manual by default) at v1 and its `Initial version` snapshot, atomically. */
  async insert(workspaceId: string, values: InsertSkill): Promise<Skill> {
    return this.mapConflict(() =>
      this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(t.skills)
          .values({
            workspaceId,
            name: values.name,
            description: values.description,
            type: values.type,
            source: values.source ?? MANUAL_SOURCE,
            body: values.body,
            enabled: values.enabled,
            evidenceFiles: values.evidenceFiles ?? null,
            version: INITIAL_SKILL_VERSION,
          })
          .returning();
        await tx.insert(t.skillVersions).values({
          skillId: row!.id,
          version: INITIAL_SKILL_VERSION,
          body: row!.body,
          message: versionMessage({ kind: 'initial' }),
        });
        return toSkillDto(row!, 0);
      }),
    );
  }

  /**
   * Patch a skill. Only a body change bumps `version` and snapshots it; any
   * change touches `updated_at`. The row is locked so concurrent edits cannot
   * both claim the same next version.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<Skill | undefined> {
    return this.mapConflict(() =>
      this.db.transaction(async (tx) => {
        const existing = await this.lockSkill(tx, workspaceId, id);
        if (!existing) return undefined;
        if (patch.expectedVersion !== undefined && existing.version !== patch.expectedVersion) {
          throw new ConflictError('Skill changed while merging — try again');
        }

        const bodyChanged = isBodyChange(existing.body, patch.body);
        const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

        await tx
          .update(t.skills)
          .set({
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.description !== undefined ? { description: patch.description } : {}),
            ...(patch.type !== undefined ? { type: patch.type } : {}),
            ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
            ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
            ...(bodyChanged ? { body: patch.body!, version: nextVersion } : {}),
            updatedAt: sql`now()`,
          })
          .where(this.scope(workspaceId, id));

        if (bodyChanged) {
          await tx.insert(t.skillVersions).values({
            skillId: id,
            version: nextVersion,
            body: patch.body!,
            message: versionMessage({ kind: 'edit', message: patch.message }),
          });
        }
        const [skill] = await this.selectWithCounts(tx, this.scope(workspaceId, id));
        return skill;
      }),
    );
  }

  /** Delete a skill; `agent_skills` links and `skill_versions` cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(this.scope(workspaceId, id))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Agents (same workspace) the skill is attached to, by agent name. */
  async agentsUsing(workspaceId: string, skillId: string): Promise<SkillAgentRef[]> {
    const rows = await this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.skillId, skillId),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.agents.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(t.agents.name));
    return rows.map((r) => ({ agent_id: r.id, agent_name: r.name, enabled: r.enabled }));
  }

  /** Version history, newest first. Empty when the skill is not in the workspace. */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[]> {
    const rows = await this.db
      .select({ v: t.skillVersions })
      .from(t.skillVersions)
      .innerJoin(t.skills, eq(t.skillVersions.skillId, t.skills.id))
      .where(this.scope(workspaceId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map((r) => toSkillVersionDto(r.v));
  }

  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const [row] = await this.db
      .select({ v: t.skillVersions })
      .from(t.skillVersions)
      .innerJoin(t.skills, eq(t.skillVersions.skillId, t.skills.id))
      .where(and(this.scope(workspaceId, skillId), eq(t.skillVersions.version, version)));
    return row ? toSkillVersionDto(row.v) : undefined;
  }

  async versionCount(workspaceId: string, skillId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.skillVersions)
      .innerJoin(t.skills, eq(t.skillVersions.skillId, t.skills.id))
      .where(this.scope(workspaceId, skillId));
    return row?.n ?? 0;
  }

  /**
   * Restore vN as a NEW version (current + 1) with vN's body and message
   * `Restored from vN`. History is never rewritten.
   */
  async restore(workspaceId: string, skillId: string, version: number): Promise<RestoreResult> {
    return this.db.transaction(async (tx): Promise<RestoreResult> => {
      const existing = await this.lockSkill(tx, workspaceId, skillId);
      if (!existing) return { kind: 'skill_not_found' };
      if (version === existing.version) return { kind: 'is_current' };

      const [source] = await tx
        .select()
        .from(t.skillVersions)
        .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
      if (!source) return { kind: 'version_not_found' };

      const nextVersion = existing.version + 1;
      await tx
        .update(t.skills)
        .set({ body: source.body, version: nextVersion, updatedAt: sql`now()` })
        .where(this.scope(workspaceId, skillId));
      await tx.insert(t.skillVersions).values({
        skillId,
        version: nextVersion,
        body: source.body,
        message: versionMessage({ kind: 'restore', from: version }),
      });
      const [skill] = await this.selectWithCounts(tx, this.scope(workspaceId, skillId));
      return { kind: 'ok', skill: skill! };
    });
  }

  /**
   * Each given agent's completed runs in `[since, now]`, with the findings of
   * those runs and how many were accepted / dismissed. ONE grouped query over
   * agent_runs ⟕ reviews ⟕ findings. Agents without runs are absent from the map.
   */
  async agentActivity(
    workspaceId: string,
    agentIds: string[],
    since: Date,
  ): Promise<Map<string, AgentActivityCounts>> {
    if (agentIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        agentId: t.agentRuns.agentId,
        runs: countDistinct(t.agentRuns.id),
        findings: count(t.findings.id),
        accepted: count(t.findings.acceptedAt),
        dismissed: count(t.findings.dismissedAt),
      })
      .from(t.agentRuns)
      .leftJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .leftJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.agentId, agentIds),
          eq(t.agentRuns.status, DONE_RUN_STATUS),
          gte(t.agentRuns.ranAt, since),
        ),
      )
      .groupBy(t.agentRuns.agentId);
    const out = new Map<string, AgentActivityCounts>();
    for (const r of rows) {
      if (!r.agentId) continue;
      out.set(r.agentId, {
        runs: r.runs,
        findings: r.findings,
        accepted: r.accepted,
        dismissed: r.dismissed,
      });
    }
    return out;
  }

  // ---- internals ------------------------------------------------------------

  private scope(workspaceId: string, id: string): SQL {
    return and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id))!;
  }

  /** Skills + agent_count via LEFT JOIN agent_skills GROUP BY skills.id (no N+1). */
  private async selectWithCounts(db: Executor, where: SQL): Promise<Skill[]> {
    const rows = await db
      .select({ skill: t.skills, agentCount: count(t.agentSkills.agentId) })
      .from(t.skills)
      .leftJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id))
      .where(where)
      .groupBy(t.skills.id)
      .orderBy(asc(t.skills.name));
    return rows.map((r) => toSkillDto(r.skill, r.agentCount));
  }

  private async lockSkill(tx: Tx, workspaceId: string, id: string) {
    const [row] = await tx
      .select()
      .from(t.skills)
      .where(this.scope(workspaceId, id))
      .for('update');
    return row;
  }

  /** Translate a unique violation on (workspace_id, name) into a 409. */
  private async mapConflict<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('A skill with this name already exists');
      throw err;
    }
  }
}
