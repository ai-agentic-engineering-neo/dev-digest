import type {
  Agent,
  AgentSkillLink,
  AgentVersion,
  CiFailOn,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { BadRequestError } from '../../platform/errors.js';
import {
  assertNoDuplicateSkills,
  isConfigChange,
  linksChanged,
  upsertLink,
  type LinkSpec,
} from './domain.js';
import type { AgentPatch, AgentStore, ModelCatalog, SkillLookup } from './ports.js';

/**
 * A2 — agents service. Business logic for the Agents tab + Agent Editor.
 * Provider/model selection uses the LLM adapter's dynamic model list.
 *
 * An Agent = provider + model + system_prompt + linked skills + output_schema +
 * enabled. A config change bumps the version and is snapshotted to
 * `agent_versions`; whether a patch is one is decided here (domain.ts).
 */

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

/**
 * A change to an agent's links: replace the whole ordered set (`skills`,
 * order = index) or link one skill (`skill_id`, upsert).
 */
export type LinkUpdateInput =
  | { skills: { skill_id: string; enabled: boolean }[] }
  | { skill_id: string; order?: number | undefined; enabled?: boolean | undefined };

export interface AgentsServiceDeps {
  agents: AgentStore;
  models: ModelCatalog;
  skills: SkillLookup;
}

export class AgentsService {
  private repo: AgentStore;

  constructor(private deps: AgentsServiceDeps) {
    this.repo = deps.agents;
  }

  async list(workspaceId: string): Promise<Agent[]> {
    return this.repo.list(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    return this.repo.getById(workspaceId, id);
  }

  /** Delete an agent (and its versions/skill-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateAgentInput, userId?: string): Promise<Agent> {
    return this.repo.insert({
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

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgentInput,
  ): Promise<Agent | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;

    const change: AgentPatch = {
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
    };
    // A config-affecting change (anything except just toggling enabled) bumps
    // the version; the store bumps it atomically and records the snapshot.
    return this.repo.update(workspaceId, id, change, isConfigChange(existing, change));
  }

  /**
   * Config history for an agent, newest version first. Workspace-scoped: returns
   * undefined when the agent isn't in this workspace (the route maps that to 404)
   * so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    return this.repo.listVersions(agentId);
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
    return this.repo.getVersion(agentId, version);
  }

  /**
   * Linked skills for an agent as AgentSkillLink[] (link order). The link
   * columns come from the agents store, name/type/global flag from the skills
   * module. Undefined when the agent is not in this workspace.
   */
  async skillLinks(workspaceId: string, agentId: string): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    return this.linksOf(workspaceId, agentId);
  }

  /** Apply a link change of either shape — the one entry point for POST /agents/:id/skills. */
  async updateLinks(
    workspaceId: string,
    agentId: string,
    input: LinkUpdateInput,
  ): Promise<AgentSkillLink[] | undefined> {
    if ('skills' in input) {
      return this.setSkills(
        workspaceId,
        agentId,
        input.skills.map((s) => ({ skillId: s.skill_id, enabled: s.enabled })),
      );
    }
    return this.linkSkill(workspaceId, agentId, input.skill_id, input.order, input.enabled);
  }

  private async linksOf(workspaceId: string, agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.repo.linkedSkills(agentId);
    if (links.length === 0) return [];
    const summaries = await this.deps.skills.summaries(
      workspaceId,
      links.map((l) => l.skillId),
    );
    const byId = new Map(summaries.map((s) => [s.id, s]));
    return links.flatMap((l) => {
      const skill = byId.get(l.skillId);
      if (!skill) return [];
      return [
        {
          agent_id: agentId,
          skill_id: l.skillId,
          order: l.order,
          enabled: l.enabled,
          name: skill.name,
          type: skill.type,
          skill_enabled: skill.enabled,
        },
      ];
    });
  }

  /**
   * Replace the agent's links with `links` (order = index). Every id must be
   * a skill of the workspace, listed once. A real change bumps the agent's
   * version and snapshots the links; an identical set writes nothing.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    links: LinkSpec[],
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    assertNoDuplicateSkills(links);
    await this.assertWorkspaceSkills(workspaceId, links.map((l) => l.skillId));
    await this.applyLinks(agentId, links);
    return this.linksOf(workspaceId, agentId);
  }

  /** Link a single skill (upsert; `enabled` defaults to true), keeping the others. */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
    enabled?: boolean,
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.assertWorkspaceSkills(workspaceId, [skillId]);
    const current = await this.currentLinks(agentId);
    await this.applyLinks(agentId, upsertLink(current, skillId, order, enabled), current);
    return this.linksOf(workspaceId, agentId);
  }

  private async currentLinks(agentId: string): Promise<LinkSpec[]> {
    const links = await this.repo.linkedSkills(agentId);
    return links.map((l) => ({ skillId: l.skillId, enabled: l.enabled }));
  }

  private async applyLinks(agentId: string, next: LinkSpec[], current?: LinkSpec[]): Promise<void> {
    const before = current ?? (await this.currentLinks(agentId));
    if (linksChanged(before, next)) await this.repo.setSkills(agentId, next);
  }

  private async assertWorkspaceSkills(workspaceId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = new Set(await this.deps.skills.existingIds(workspaceId, ids));
    const unknown = ids.find((id) => !found.has(id));
    if (unknown) throw new BadRequestError('unknown_skill', `Skill ${unknown} is not in this workspace`);
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.deps.models(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }
}
