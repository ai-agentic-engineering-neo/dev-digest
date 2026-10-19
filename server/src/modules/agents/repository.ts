import { and, asc, avg, count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange } from './helpers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** A skill linked to an agent (with its order), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
  /** Linked-but-disabled links keep their slot but stay out of the prompt. */
  enabled: boolean;
}

/** One entry of the ordered set written by the Skills tab (order = index). */
export interface SkillLinkInput {
  skillId: string;
  enabled: boolean;
}

export class AgentsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  private async snapshotVersion(row: AgentRow, version: number): Promise<void> {
    // The ordered skills that would go into the prompt (link AND skill enabled).
    const skills = (await this.enabledSkillsForRun(row.id)).map((s) => s.id);
    await this.db
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order, enabled: t.agentSkills.enabled })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order, enabled: r.enabled }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /**
   * L02 — the skills that go into this agent's prompt, in order: the link is
   * enabled (Skills tab checkbox) AND the skill itself is enabled (Skills page).
   */
  async enabledSkillsForRun(agentId: string): Promise<(typeof t.skills.$inferSelect)[]> {
    const links = await this.linkedSkills(agentId);
    return links.filter((l) => l.enabled && l.skill.enabled).map((l) => l.skill);
  }

  /** agentId → number of prompt-active skills, for the agents list badge. */
  async activeSkillCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ agentId: t.agentSkills.agentId, n: count() })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skills.enabled, true),
          eq(t.agentSkills.enabled, true),
        ),
      )
      .groupBy(t.agentSkills.agentId);
    return new Map(rows.map((r) => [r.agentId, Number(r.n)]));
  }

  /**
   * agentId → list-card stats: completed runs + mean cost of priced runs (from
   * agent_runs), and accepted / (accepted + dismissed) over the agent's findings.
   */
  async runStats(
    workspaceId: string,
  ): Promise<Map<string, { runs: number; avgCostUsd: number | null; acceptRate: number | null }>> {
    const runs = await this.db
      .select({ agentId: t.agentRuns.agentId, n: count(), cost: avg(t.agentRuns.costUsd) })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.status, 'done'), isNotNull(t.agentRuns.agentId)))
      .groupBy(t.agentRuns.agentId);
    const verdicts = await this.db
      .select({
        agentId: t.reviews.agentId,
        accepted: sql<number>`count(${t.findings.acceptedAt})`,
        dismissed: sql<number>`count(${t.findings.dismissedAt})`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.workspaceId, workspaceId), isNotNull(t.reviews.agentId)))
      .groupBy(t.reviews.agentId);

    const out = new Map<string, { runs: number; avgCostUsd: number | null; acceptRate: number | null }>();
    for (const r of runs) {
      out.set(r.agentId!, { runs: Number(r.n), avgCostUsd: r.cost == null ? null : Number(r.cost), acceptRate: null });
    }
    for (const v of verdicts) {
      const resolved = Number(v.accepted) + Number(v.dismissed);
      const entry = out.get(v.agentId!) ?? { runs: 0, avgCostUsd: null, acceptRate: null };
      entry.acceptRate = resolved > 0 ? Number(v.accepted) / resolved : null;
      out.set(v.agentId!, entry);
    }
    return out;
  }

  /** True when every id is a skill of this workspace (no cross-tenant links). */
  async skillsBelongToWorkspace(workspaceId: string, skillIds: string[]): Promise<boolean> {
    const unique = [...new Set(skillIds)];
    if (unique.length === 0) return true;
    const [row] = await this.db
      .select({ n: count() })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, unique)));
    return Number(row?.n ?? 0) === unique.length;
  }

  /**
   * L02 — replace the agent's whole ordered link set (order = index) in ONE
   * transaction, so a failed insert never leaves the agent with no skills.
   */
  async replaceSkills(agentId: string, items: SkillLinkInput[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (items.length === 0) return;
      await tx.insert(t.agentSkills).values(
        items.map((it, i) => ({ agentId, skillId: it.skillId, order: i, enabled: it.enabled })),
      );
    });
  }

  /** Link a skill to an agent at a given order (idempotent: upserts order). */
  async linkSkill(agentId: string, skillId: string, order: number): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order },
      });
  }

  async unlinkSkill(agentId: string, skillId: string): Promise<void> {
    await this.db
      .delete(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));
  }

  /**
   * Replace the full set of linked skills for an agent with `skillIds`, assigning
   * order = index. Used by the "Skills" editor tab (attach/reorder). Skills not in
   * the list are unlinked.
   */
  async setSkills(agentId: string, skillIds: string[]): Promise<void> {
    await this.replaceSkills(
      agentId,
      skillIds.map((skillId) => ({ skillId, enabled: true })),
    );
  }
}
