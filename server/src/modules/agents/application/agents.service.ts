import type { ModelInfo, Provider } from '@devdigest/shared';
import { AgentNotFound, AgentVersionNotFound } from '../domain/errors.js';
import {
  INITIAL_AGENT_VERSION,
  applyAgentPatch,
  configSnapshotOf,
} from '../domain/policies.js';
import type {
  AgentsRepository,
  AgentsUnitOfWork,
  ModelCatalogFor,
} from '../domain/ports.js';
import type { Agent, AgentPatch, AgentVersion, NewAgent, SkillLink } from '../domain/types.js';

export interface AgentsDeps {
  agents: AgentsRepository;
  uow: AgentsUnitOfWork;
  modelsFor: ModelCatalogFor;
}

/**
 * A2 — agents use cases (Agents tab + Agent Editor). Every agent read is
 * workspace-scoped; a missing agent raises AgentNotFound. Writes that touch
 * more than one row (agent + version snapshot, skill set) run in one
 * transaction through the Unit of Work.
 */
export class AgentsService {
  constructor(private readonly d: AgentsDeps) {}

  list(workspaceId: string): Promise<Agent[]> {
    return this.d.agents.list(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<Agent> {
    const agent = await this.d.agents.getById(workspaceId, id);
    if (!agent) throw new AgentNotFound();
    return agent;
  }

  /** Versions and skill links cascade; past runs keep agent_id = null. */
  async delete(workspaceId: string, id: string): Promise<void> {
    if (!(await this.d.agents.delete(workspaceId, id))) throw new AgentNotFound();
  }

  /** Create the agent and record its version-1 snapshot atomically. */
  create(input: NewAgent): Promise<Agent> {
    return this.d.uow.run(async ({ agents }) => {
      const agent = await agents.create(input, INITIAL_AGENT_VERSION);
      await agents.appendVersion(agent.id, agent.version, configSnapshotOf(agent, []));
      return agent;
    });
  }

  /**
   * Apply a patch. A config change (anything but `enabled`) bumps the version
   * and snapshots the new config, in the same transaction as the update.
   */
  update(workspaceId: string, id: string, patch: AgentPatch): Promise<Agent> {
    return this.d.uow.run(async ({ agents }) => {
      const current = await agents.getById(workspaceId, id);
      if (!current) throw new AgentNotFound();
      const { next, versionBumped } = applyAgentPatch(current, patch);
      const saved = await agents.save(next);
      if (versionBumped) {
        const skillIds = (await agents.skillLinks(id)).map((l) => l.skillId);
        await agents.appendVersion(id, saved.version, configSnapshotOf(saved, skillIds));
      }
      return saved;
    });
  }

  /** Config history, newest first. */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[]> {
    await this.get(workspaceId, agentId);
    return this.d.agents.listVersions(agentId);
  }

  async getVersion(workspaceId: string, agentId: string, version: number): Promise<AgentVersion> {
    await this.get(workspaceId, agentId);
    const snapshot = await this.d.agents.getVersion(agentId, version);
    if (!snapshot) throw new AgentVersionNotFound();
    return snapshot;
  }

  async skillLinks(workspaceId: string, agentId: string): Promise<SkillLink[]> {
    await this.get(workspaceId, agentId);
    return this.d.agents.skillLinks(agentId);
  }

  /** Replace the whole ordered skill set (delete + insert in one transaction). */
  async setSkills(workspaceId: string, agentId: string, skillIds: string[]): Promise<SkillLink[]> {
    return this.d.uow.run(async ({ agents }) => {
      if (!(await agents.getById(workspaceId, agentId))) throw new AgentNotFound();
      await agents.setSkills(agentId, skillIds);
      return agents.skillLinks(agentId);
    });
  }

  /** Link one skill; without `order` it is appended after the existing links. */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<SkillLink[]> {
    return this.d.uow.run(async ({ agents }) => {
      if (!(await agents.getById(workspaceId, agentId))) throw new AgentNotFound();
      const resolvedOrder = order ?? (await agents.skillLinks(agentId)).length;
      await agents.linkSkill(agentId, skillId, resolvedOrder);
      return agents.skillLinks(agentId);
    });
  }

  /** The agent's provider models; [] when the provider key isn't configured. */
  async listModelsForAgent(workspaceId: string, agentId: string): Promise<ModelInfo[]> {
    const agent = await this.get(workspaceId, agentId);
    return this.listModels(agent.provider);
  }

  /** Dynamic model list; degrades to [] so the editor still renders without a key. */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      return await (await this.d.modelsFor(provider)).listModels();
    } catch {
      return [];
    }
  }
}
