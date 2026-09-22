import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Agent, AgentSkillLink, AgentVersion } from '@devdigest/shared';
import type { Db, DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange, type AgentPatch, type NewAgent } from './domain.js';
import { toAgentDto, toAgentVersionDto } from './infrastructure/mappers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 *
 * Two surfaces: row methods (`list`, `getById`, `insert`, `update`, …) for the
 * other modules that consume agents through `container.agentsRepo`, and DTO
 * methods (`listAgents`, `findAgent`, `createAgent`, …) that the agents
 * service uses — rows never leave this file for it.
 */

export type { AgentRow, AgentVersionRow };

/** A skill linked to an agent (with its order), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
}

export class AgentsRepository {
  constructor(private db: DbOrTx) {}

  /** Run `work` atomically on a repository bound to one transaction (a savepoint
   *  when this repository is already transaction-bound). */
  private atomically<T>(work: (repo: AgentsRepository) => Promise<T>): Promise<T> {
    return (this.db as Db).transaction((tx) => work(new AgentsRepository(tx)));
  }

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
  async insert(values: NewAgent): Promise<AgentRow> {
    return this.atomically((repo) => repo.insertInTx(values));
  }

  private async insertInTx(values: NewAgent): Promise<AgentRow> {
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
   * config into agent_versions (reproducibility for eval). One transaction with
   * the agent row locked (FOR UPDATE), so concurrent edits serialize and each
   * config change gets its own version + snapshot.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: AgentPatch,
  ): Promise<AgentRow | undefined> {
    return this.atomically((repo) => repo.updateInTx(workspaceId, id, patch));
  }

  private async updateInTx(
    workspaceId: string,
    id: string,
    patch: AgentPatch,
  ): Promise<AgentRow | undefined> {
    const [existing] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .for('update');
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

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
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
    // Atomic: a failed insert (e.g. unknown skill id) must not leave the agent
    // with its old links already deleted.
    await this.atomically(async (repo) => {
      await repo.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (skillIds.length === 0) return;
      await repo.db
        .insert(t.agentSkills)
        .values(skillIds.map((skillId, i) => ({ agentId, skillId, order: i })));
    });
  }

  /** `id → name` for the given agent ids in one query (workspace-scoped). */
  async namesByIds(workspaceId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), inArray(t.agents.id, ids)));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  // ---- DTO read/write surface (the agents service) --------------------------

  async listAgents(workspaceId: string): Promise<Agent[]> {
    return (await this.list(workspaceId)).map(toAgentDto);
  }

  async findAgent(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.getById(workspaceId, id);
    return row ? toAgentDto(row) : undefined;
  }

  async createAgent(values: NewAgent): Promise<Agent> {
    return toAgentDto(await this.insert(values));
  }

  async updateAgent(workspaceId: string, id: string, patch: AgentPatch): Promise<Agent | undefined> {
    const row = await this.update(workspaceId, id, patch);
    return row ? toAgentDto(row) : undefined;
  }

  async listAgentVersions(agentId: string): Promise<AgentVersion[]> {
    return (await this.listVersions(agentId)).map(toAgentVersionDto);
  }

  async findAgentVersion(agentId: string, version: number): Promise<AgentVersion | undefined> {
    const row = await this.getVersion(agentId, version);
    return row ? toAgentVersionDto(row) : undefined;
  }

  /** Linked skills as ordered `AgentSkillLink`s. */
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => ({ agent_id: agentId, skill_id: l.skill.id, order: l.order }));
  }
}
