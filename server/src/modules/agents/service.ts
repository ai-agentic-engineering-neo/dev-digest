import type {
  Agent,
  AgentSkillLink,
  AgentVersion,
  CiFailOn,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import type { AgentsRepository } from './repository.js';
import { toAgentDto, toAgentVersionDto } from './helpers.js';
import { AppError, SkillFlaggedError } from '../../platform/errors.js';

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

/** Storage the agents use cases need (implemented by AgentsRepository). */
export type AgentsStore = Pick<
  AgentsRepository,
  | 'list'
  | 'skillCounts'
  | 'skillCount'
  | 'skillIdsInWorkspace'
  | 'flaggedSkills'
  | 'getById'
  | 'deleteById'
  | 'insert'
  | 'update'
  | 'listVersions'
  | 'getVersion'
  | 'linkedSkills'
  | 'linkSkill'
  | 'setSkills'
>;

/** Resolves the LLM adapter for a provider (Container.llm in production). */
export type LlmResolver = (provider: Provider) => Promise<{ listModels(): Promise<ModelInfo[]> }>;

export class AgentsService {
  private readonly repo: AgentsStore;
  private readonly llm: LlmResolver;

  /** Explicit deps (onion-architecture §10): no Container, no repository built here. */
  constructor(deps: { repo: AgentsStore; llm: LlmResolver }) {
    this.repo = deps.repo;
    this.llm = deps.llm;
  }

  async list(workspaceId: string): Promise<Agent[]> {
    const [rows, counts] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.skillCounts(workspaceId),
    ]);
    return rows.map((row) => toAgentDto(row, counts.get(row.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toAgentDto(row, await this.repo.skillCount(row.id)) : undefined;
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
    return toAgentDto(row, 0);
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
    return row ? toAgentDto(row, await this.repo.skillCount(row.id)) : undefined;
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

  /** Linked skills for an agent as AgentSkillLink[] (ordered). */
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.repo.linkedSkills(agentId);
    return links.map((l) => ({ agent_id: agentId, skill_id: l.skill.id, order: l.order }));
  }

  /**
   * Set / reorder the agent's linked skills. If `skillIds` is provided, replaces
   * the whole set in that order. Returns the resulting ordered links.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    skillIds: string[],
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.assertWorkspaceSkills(workspaceId, skillIds);
    // Already-linked skills may stay (and be reordered / unlinked); only new
    // links are checked, so a skill flagged after linking is never stuck.
    const linked = new Set((await this.repo.linkedSkills(agentId)).map((l) => l.skill.id));
    await this.assertNotFlagged(workspaceId, skillIds.filter((id) => !linked.has(id)));
    await this.repo.setSkills(agentId, skillIds);
    return this.skillLinks(agentId);
  }

  /** Link a single skill (append or set order) — additive to existing links. */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.assertWorkspaceSkills(workspaceId, [skillId]);
    const existing = await this.repo.linkedSkills(agentId);
    if (!existing.some((l) => l.skill.id === skillId)) {
      await this.assertNotFlagged(workspaceId, [skillId]);
    }
    const resolvedOrder = order ?? existing.length;
    await this.repo.linkSkill(agentId, skillId, resolvedOrder);
    return this.skillLinks(agentId);
  }

  /**
   * Every id must be a distinct skill of the agent's workspace — the FK alone
   * accepts any existing skill, so without this a foreign tenant's skill could
   * be linked (and its body would land in this workspace's prompts).
   */
  private async assertWorkspaceSkills(workspaceId: string, skillIds: string[]): Promise<void> {
    const unique = [...new Set(skillIds)];
    if (unique.length !== skillIds.length) {
      throw new AppError('invalid_skill_ids', 'Duplicate skill ids', 400);
    }
    const owned = new Set(await this.repo.skillIdsInWorkspace(workspaceId, unique));
    const unknown = unique.filter((id) => !owned.has(id));
    if (unknown.length > 0) {
      throw new AppError('invalid_skill_ids', 'Unknown skill ids for this workspace', 400, {
        skill_ids: unknown,
      });
    }
  }

  /** A skill whose body fails the injection scan cannot be newly linked (422). */
  private async assertNotFlagged(workspaceId: string, skillIds: string[]): Promise<void> {
    const flagged = await this.repo.flaggedSkills(workspaceId, skillIds);
    if (flagged.length === 0) return;
    const names = flagged.map((f) => `"${f.name}"`).join(', ');
    throw new SkillFlaggedError(
      `Skill ${names} is flagged as a possible prompt injection; fix it before linking it to an agent`,
      { skill_ids: flagged.map((f) => f.id) },
    );
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.llm(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }
}
