import type {
  Agent,
  AgentSkillLink,
  AgentVersion,
  CreateAgentInput,
  LLMProvider,
  ModelInfo,
  Provider,
} from '@devdigest/shared';
import type { AgentPatch, NewAgent } from './domain.js';

/**
 * A2 — agents service. Business logic for the Agents tab + Agent Editor.
 * Provider/model selection uses the LLM adapter's dynamic model list.
 *
 * An Agent = provider + model + system_prompt + linked skills + output_schema +
 * enabled. Config changes are versioned via `agent_versions` (repository, rule
 * in ./domain.ts `isConfigChange`).
 */

/** Body of PUT /agents/:id — every create field is optional. */
export type UpdateAgentInput = Partial<CreateAgentInput>;

/** What the service needs from persistence (AgentsRepository implements it). */
export interface AgentsStore {
  listAgents(workspaceId: string): Promise<Agent[]>;
  findAgent(workspaceId: string, id: string): Promise<Agent | undefined>;
  createAgent(values: NewAgent): Promise<Agent>;
  updateAgent(workspaceId: string, id: string, patch: AgentPatch): Promise<Agent | undefined>;
  deleteById(workspaceId: string, id: string): Promise<boolean>;
  listAgentVersions(agentId: string): Promise<AgentVersion[]>;
  findAgentVersion(agentId: string, version: number): Promise<AgentVersion | undefined>;
  skillLinks(agentId: string): Promise<AgentSkillLink[]>;
  setSkills(agentId: string, skillIds: string[]): Promise<void>;
  linkSkill(agentId: string, skillId: string, order: number): Promise<void>;
}

export interface AgentsServiceDeps {
  agents: AgentsStore;
  /** Resolve the LLM provider (throws when its key is not configured). */
  llm: (provider: Provider) => Promise<LLMProvider>;
}

export class AgentsService {
  constructor(private readonly deps: AgentsServiceDeps) {}

  list(workspaceId: string): Promise<Agent[]> {
    return this.deps.agents.listAgents(workspaceId);
  }

  get(workspaceId: string, id: string): Promise<Agent | undefined> {
    return this.deps.agents.findAgent(workspaceId, id);
  }

  /** Delete an agent (and its versions/skill-links, via cascade). */
  delete(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.agents.deleteById(workspaceId, id);
  }

  create(workspaceId: string, input: CreateAgentInput, userId?: string): Promise<Agent> {
    return this.deps.agents.createAgent({
      workspaceId,
      name: input.name,
      description: input.description,
      provider: input.provider,
      model: input.model,
      systemPrompt: input.system_prompt,
      outputSchema: input.output_schema,
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.ci_fail_on !== undefined ? { ciFailOn: input.ci_fail_on } : {}),
      ...(input.repo_intel !== undefined ? { repoIntel: input.repo_intel } : {}),
      enabled: input.enabled,
      createdBy: userId ?? null,
    });
  }

  update(workspaceId: string, id: string, patch: UpdateAgentInput): Promise<Agent | undefined> {
    return this.deps.agents.updateAgent(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.system_prompt !== undefined ? { systemPrompt: patch.system_prompt } : {}),
      ...(patch.output_schema !== undefined ? { outputSchema: patch.output_schema } : {}),
      ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
      ...(patch.ci_fail_on !== undefined ? { ciFailOn: patch.ci_fail_on } : {}),
      ...(patch.repo_intel !== undefined ? { repoIntel: patch.repo_intel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    });
  }

  /**
   * Config history for an agent, newest version first. Workspace-scoped: returns
   * undefined when the agent isn't in this workspace (the route maps that to 404)
   * so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    if (!(await this.get(workspaceId, agentId))) return undefined;
    return this.deps.agents.listAgentVersions(agentId);
  }

  /**
   * A single config snapshot for an agent. Returns undefined when the agent isn't
   * in this workspace OR that version was never recorded (route → 404).
   */
  async getVersion(workspaceId: string, agentId: string, version: number): Promise<AgentVersion | undefined> {
    if (!(await this.get(workspaceId, agentId))) return undefined;
    return this.deps.agents.findAgentVersion(agentId, version);
  }

  /** Linked skills for an agent (ordered). */
  skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    return this.deps.agents.skillLinks(agentId);
  }

  /**
   * Replace the agent's linked skills with `skillIds`, in that order. Returns
   * the resulting ordered links, or undefined when the agent isn't in the workspace.
   */
  async setSkills(workspaceId: string, agentId: string, skillIds: string[]): Promise<AgentSkillLink[] | undefined> {
    if (!(await this.get(workspaceId, agentId))) return undefined;
    await this.deps.agents.setSkills(agentId, skillIds);
    return this.skillLinks(agentId);
  }

  /** Link a single skill (append, or at `order`) — additive to existing links. */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<AgentSkillLink[] | undefined> {
    if (!(await this.get(workspaceId, agentId))) return undefined;
    const resolvedOrder = order ?? (await this.skillLinks(agentId)).length;
    await this.deps.agents.linkSkill(agentId, skillId, resolvedOrder);
    return this.skillLinks(agentId);
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.deps.llm(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }
}
