import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { DEFAULT_AGENT_DESCRIPTION } from '../domain/policies.js';
import type { AgentsRepository } from '../domain/ports.js';
import type {
  Agent,
  AgentConfigSnapshot,
  AgentVersion,
  NewAgent,
  SkillLink,
} from '../domain/types.js';
import { toAgent, toAgentVersion, toConfigJson } from './mappers.js';

/**
 * Drizzle implementation of the AgentsRepository port. Owns `agents`,
 * `agent_versions` and the agent side of `agent_skills`. Pure data access —
 * version bumps and snapshots are decided by the use case. `db` is either the
 * root connection or a transaction (see DrizzleAgentsUnitOfWork).
 */
export class DrizzleAgentsRepository implements AgentsRepository {
  constructor(private readonly db: Db) {}

  async list(workspaceId: string): Promise<Agent[]> {
    const rows = await this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    return rows.map(toAgent);
  }

  async listEnabled(workspaceId: string): Promise<Agent[]> {
    const rows = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
    return rows.map(toAgent);
  }

  async getById(workspaceId: string, id: string): Promise<Agent | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row ? toAgent(row) : undefined;
  }

  async create(input: NewAgent, version: number): Promise<Agent> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: input.provider,
        model: input.model,
        systemPrompt: input.systemPrompt,
        outputSchema: (input.outputSchema as object | undefined) ?? null,
        ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
        ...(input.ciFailOn !== undefined ? { ciFailOn: input.ciFailOn } : {}),
        ...(input.repoIntel !== undefined ? { repoIntel: input.repoIntel } : {}),
        enabled: input.enabled ?? true,
        version,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return toAgent(row!);
  }

  async save(agent: Agent): Promise<Agent> {
    const [row] = await this.db
      .update(t.agents)
      .set({
        name: agent.name,
        description: agent.description,
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        outputSchema: agent.outputSchema as object | null,
        strategy: agent.strategy,
        ciFailOn: agent.ciFailOn,
        repoIntel: agent.repoIntel,
        enabled: agent.enabled,
        version: agent.version,
      })
      .where(and(eq(t.agents.workspaceId, agent.workspaceId), eq(t.agents.id, agent.id)))
      .returning();
    if (!row) throw new Error(`agent ${agent.id} vanished during save`);
    return toAgent(row);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  async appendVersion(agentId: string, version: number, config: AgentConfigSnapshot): Promise<void> {
    await this.db
      .insert(t.agentVersions)
      .values({ agentId, version, configJson: toConfigJson(config) })
      .onConflictDoNothing();
  }

  async listVersions(agentId: string): Promise<AgentVersion[]> {
    const rows = await this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
    return rows.map(toAgentVersion);
  }

  async getVersion(agentId: string, version: number): Promise<AgentVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row ? toAgentVersion(row) : undefined;
  }

  async skillLinks(agentId: string): Promise<SkillLink[]> {
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows;
  }

  async linkSkill(agentId: string, skillId: string, order: number): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order },
      });
  }

  async setSkills(agentId: string, skillIds: string[]): Promise<void> {
    await this.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    if (skillIds.length === 0) return;
    await this.db
      .insert(t.agentSkills)
      .values(skillIds.map((skillId, i) => ({ agentId, skillId, order: i })));
  }
}
