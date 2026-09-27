import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`, and READS the
 * `agent_skills` link table that the agents module owns the write side of —
 * "which agents use this skill" and "which skills does this agent load" are
 * the same two columns read from opposite ends.
 *
 * Workspace-scoped throughout: a skill belongs to a workspace, and every read
 * that can reach one takes the workspace id.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
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
  body?: string;
  enabled?: boolean;
  /** One-line "what changed", recorded on the snapshot a body change creates. */
  note?: string;
}

/** An agent that links a skill — the Stats tab's "used by" list. */
export interface SkillAgentRow {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
}

/** The shape the review run needs: enough to render a labelled prompt block. */
export interface LinkedSkillForPrompt {
  id: string;
  name: string;
  type: string;
  source: string;
  body: string;
}

export class SkillsRepository {
  constructor(private db: Db) {}

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

  /**
   * How many agents link each of `skillIds`, as ONE grouped IN-query (the read
   * model the PR list uses: a derived column is a single extra query, never a
   * query per row). Skills with no agents are simply absent from the map.
   */
  async agentCounts(skillIds: string[]): Promise<Map<string, number>> {
    if (skillIds.length === 0) return new Map();
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, count: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .where(inArray(t.agentSkills.skillId, skillIds))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, Number(r.count)]));
  }

  /** Agents that link this skill, in the order they load it. */
  async agentsUsing(skillId: string): Promise<SkillAgentRow[]> {
    const rows = await this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        enabled: t.agents.enabled,
        order: t.agentSkills.order,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, skillId))
      .orderBy(asc(t.agents.name));
    return rows;
  }

  /**
   * The skills a review run must load for an agent: linked, ENABLED, in
   * `agent_skills.order`. A disabled skill is filtered out here, in SQL, so no
   * caller can forget it — that filter is what the control experiment measures.
   */
  async linkedEnabled(agentId: string): Promise<LinkedSkillForPrompt[]> {
    return this.db
      .select({
        id: t.skills.id,
        name: t.skills.name,
        type: t.skills.type,
        source: t.skills.source,
        body: t.skills.body,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order));
  }

  /**
   * Insert a skill AND record version 1 (immutable body snapshot).
   *
   * One transaction, because half of this is worse than none: a committed skill
   * whose v1 snapshot failed reports `version: 1` while `/versions` is empty,
   * and the "replay the exact text that was scored" guarantee is gone with no
   * error anywhere.
   */
  async insert(values: InsertSkill, note?: string): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
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
      await tx
        .insert(t.skillVersions)
        .values({
          skillId: row!.id,
          version: INITIAL_SKILL_VERSION,
          body: row!.body,
          note: note ?? null,
        });
      return row!;
    });
  }

  /**
   * Update a skill. A changed BODY bumps the version and snapshots it; metadata
   * edits (name/description/type/enabled) do not — the version numbers the text
   * an eval scored, not the row.
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

    const set = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(bodyChanged ? { version: nextVersion } : {}),
    };
    // Drizzle throws `No values to set` on an empty set (drizzle-orm/utils.js
    // `mapUpdateSet`), and every field of the route's body schema is optional —
    // so `PUT /skills/:id {}` (or a body carrying only `note`, which is not a
    // column) would answer 500. A patch that changes nothing is a no-op read.
    if (Object.keys(set).length === 0) return existing;

    // The version bump is a read-modify-write, so it needs both a transaction
    // and a guard on the version we read: two concurrent saves would otherwise
    // both compute v4, and the second snapshot would be dropped, leaving
    // skill_versions.v4 holding text that was never the live body.
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set(set)
        .where(
          and(
            eq(t.skills.workspaceId, workspaceId),
            eq(t.skills.id, id),
            eq(t.skills.version, existing.version),
          ),
        )
        .returning();
      // Lost the race: another save bumped the version between our read and
      // our write. Report the current row rather than a half-applied edit.
      if (!row) {
        const [current] = await tx
          .select()
          .from(t.skills)
          .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
        return current;
      }
      if (bodyChanged) {
        await tx
          .insert(t.skillVersions)
          .values({ skillId: row.id, version: nextVersion, body: row.body, note: patch.note ?? null });
      }
      return row;
    });
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  // ---- skill_versions (append-only body history) --------------------------

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

}
