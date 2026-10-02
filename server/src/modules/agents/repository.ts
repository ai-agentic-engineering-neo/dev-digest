import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiFailOn, Provider, ReviewStrategy, SkillType } from '@devdigest/shared';
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
  /** Per-agent gate (`agent_skills.enabled`) — NOT the workspace gate. */
  enabled: boolean;
}

/**
 * The subset of a skill the prompt needs. Deliberately narrow: the run executor
 * renders `{ name, type, body }` through `renderSkillBlock` and nothing else,
 * so widening this would invite a second, drifting renderer.
 */
export interface PromptSkillRow {
  id: string;
  name: string;
  type: SkillType;
  body: string;
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
    const skills = await this.skillIdsForAgent(row.id);
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

  /** Skills linked to an agent, in `order` ascending (enabled or not). */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({
        skill: t.skills,
        order: t.agentSkills.order,
        enabled: t.agentSkills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order, enabled: r.enabled }));
  }

  /**
   * Skills that will actually reach the prompt: linked AND enabled on BOTH
   * gates, in `order` ascending.
   *
   * `skills.enabled` is the workspace/vetting gate (an imported skill lands
   * false until a human reads it); `agent_skills.enabled` is the per-agent
   * gate. They are independent on purpose — switching a skill off workspace-wide
   * removes it from every prompt while leaving each agent's checkbox (and each
   * link's `order`) untouched.
   */
  async enabledSkills(agentId: string): Promise<PromptSkillRow[]> {
    const rows = await this.db
      .select({
        id: t.skills.id,
        name: t.skills.name,
        type: t.skills.type,
        body: t.skills.body,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
    return rows;
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /**
   * Link a skill to an agent at a given order (idempotent: upserts order).
   * Only `order` is upserted — an existing link's `enabled` flag survives a
   * re-link, so reordering in the editor never silently switches a skill back on.
   */
  async linkSkill(
    agentId: string,
    skillId: string,
    order: number,
    enabled?: boolean,
  ): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order, ...(enabled !== undefined ? { enabled } : {}) })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order, ...(enabled !== undefined ? { enabled } : {}) },
      });
  }

  /**
   * Flip the per-agent gate (and optionally the order) WITHOUT deleting the
   * link — that is the whole point of the `enabled` column: `order` survives an
   * off/on cycle, so re-enabling restores the skill's place in the prompt
   * instead of appending it to the end.
   *
   * If no link row exists yet, one is inserted (the agent editor's Skills tab
   * lists every workspace skill, so the first check on a never-linked row lands
   * here). The inserted order is `order ?? (count of existing links)` — appended.
   */
  async setSkillEnabled(
    agentId: string,
    skillId: string,
    patch: { enabled?: boolean; order?: number },
  ): Promise<void> {
    const [existing] = await this.db
      .select({ order: t.agentSkills.order })
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));

    if (existing) {
      // No-op guard: an empty patch must not clobber the row.
      if (patch.enabled === undefined && patch.order === undefined) return;
      await this.db
        .update(t.agentSkills)
        .set({
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.order !== undefined ? { order: patch.order } : {}),
        })
        .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));
      return;
    }

    const links = await this.linkedSkills(agentId);
    await this.db.insert(t.agentSkills).values({
      agentId,
      skillId,
      order: patch.order ?? links.length,
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
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
   *
   * The per-agent `enabled` flag of a link that SURVIVES the replace is carried
   * over — a drag-to-reorder posts the whole ordered set, and it must not
   * silently switch every unchecked skill back on. Newly-added ids default to
   * enabled (checking a row in the editor is what attaches it).
   */
  async setSkills(agentId: string, skillIds: string[]): Promise<void> {
    const previous = new Map(
      (await this.linkedSkills(agentId)).map((l) => [l.skill.id, l.enabled]),
    );
    await this.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    if (skillIds.length === 0) return;
    await this.db.insert(t.agentSkills).values(
      skillIds.map((skillId, i) => ({
        agentId,
        skillId,
        order: i,
        enabled: previous.get(skillId) ?? true,
      })),
    );
  }
}
