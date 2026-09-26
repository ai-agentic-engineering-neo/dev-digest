import type { Container } from '../../platform/container.js';
import type {
  Agent,
  AgentSkillItem,
  AgentVersion,
  CiFailOn,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { AgentsRepository } from './repository.js';
import { toAgentDto, toAgentVersionDto } from './helpers.js';

/**
 * A2 — agents service. Business logic for the Agents tab + Agent Editor.
 * Provider/model selection uses the LLM adapter's dynamic model list.
 *
 * An Agent = provider + model + system_prompt + linked skills + output_schema +
 * enabled. Config changes are versioned via `agent_versions` (repository).
 */

// Re-exported for backwards compatibility; implementation lives in ./helpers.
export { toAgentDto } from './helpers.js';

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  system_prompt?: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

export class AgentsService {
  private repo: AgentsRepository;

  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Agent[]> {
    const rows = await this.repo.list(workspaceId);
    const counts = await this.repo.countSkillsByAgentIds(rows.map((r) => r.id));
    return rows.map((row) => toAgentDto(row, counts.get(row.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toAgentDto(row) : undefined;
  }

  /** Delete an agent (and its versions/skill-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateAgentInput, userId?: string): Promise<Agent> {
    const row = await this.repo.insert({
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
    return toAgentDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgentInput,
  ): Promise<Agent | undefined> {
    const row = await this.repo.update(workspaceId, id, {
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
    return row ? toAgentDto(row) : undefined;
  }

  /**
   * Config history for an agent, newest version first. Workspace-scoped: returns
   * undefined when the agent isn't in this workspace (the route maps that to 404)
   * so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listVersions(agentId);
    return rows.map(toAgentVersionDto);
  }

  /**
   * A single config snapshot for an agent. Returns undefined when the agent isn't
   * in this workspace OR that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersion | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.getVersion(agentId, version);
    return row ? toAgentVersionDto(row) : undefined;
  }

  /**
   * The Skills tab's row list for an agent: every workspace skill, linked ones
   * first (in `agent_skills.order`, carrying `linked:true` and their own
   * `enabled`), then every unlinked workspace skill (`linked:false, enabled:true,
   * order:null` — their would-be default if linked). Workspace-checks the agent
   * first; `undefined` → the route 404s.
   */
  async agentSkills(workspaceId: string, agentId: string): Promise<AgentSkillItem[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;

    const [links, allSkills] = await Promise.all([
      this.repo.linkedSkills(agentId),
      this.repo.allSkillsForWorkspace(workspaceId),
    ]);
    const linkedIds = new Set(links.map((l) => l.skill.id));

    const linkedItems: AgentSkillItem[] = links.map((l) => ({
      id: l.skill.id,
      name: l.skill.name,
      description: l.skill.description,
      type: l.skill.type as AgentSkillItem['type'],
      linked: true,
      enabled: l.enabled,
      order: l.order,
    }));
    const unlinkedItems: AgentSkillItem[] = allSkills
      .filter((s) => !linkedIds.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        type: s.type as AgentSkillItem['type'],
        linked: false,
        enabled: true,
        order: null,
      }));
    return [...linkedItems, ...unlinkedItems];
  }

  /**
   * Replace the agent's full linked-skill set from the Skills tab's PUT (every
   * toggle/reorder sends the whole ordered list). Rejects — as a 404, the same
   * "resource in another workspace" shape `listVersions`/`getVersion` use — if
   * any `skill_id` does not belong to this workspace, closing the tenancy hole
   * where a foreign skill could otherwise get silently linked.
   */
  async setAgentSkills(
    workspaceId: string,
    agentId: string,
    items: { skill_id: string; enabled: boolean }[],
  ): Promise<AgentSkillItem[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;

    const allExist = await this.repo.skillIdsExistInWorkspace(
      workspaceId,
      items.map((i) => i.skill_id),
    );
    if (!allExist) return undefined;

    await this.repo.setSkills(
      agentId,
      items.map((i) => ({ skillId: i.skill_id, enabled: i.enabled })),
    );
    return this.agentSkills(workspaceId, agentId);
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.container.llm(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }
}
