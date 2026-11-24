import { describe, it, expect } from 'vitest';
import { AgentsService } from '../src/modules/agents/application/agents.service.js';
import { AgentNotFound, AgentVersionNotFound } from '../src/modules/agents/domain/errors.js';
import type { AgentsRepository } from '../src/modules/agents/domain/ports.js';
import type {
  Agent,
  AgentConfigSnapshot,
  AgentVersion,
  NewAgent,
  SkillLink,
} from '../src/modules/agents/domain/types.js';

/** In-memory AgentsRepository; `run` snapshots state so a throw rolls back. */
class FakeAgents implements AgentsRepository {
  agents = new Map<string, Agent>();
  versions: AgentVersion[] = [];
  links = new Map<string, SkillLink[]>();
  private seq = 0;

  async list(ws: string) {
    return [...this.agents.values()].filter((a) => a.workspaceId === ws);
  }
  async listEnabled(ws: string) {
    return (await this.list(ws)).filter((a) => a.enabled);
  }
  async getById(ws: string, id: string) {
    const a = this.agents.get(id);
    return a && a.workspaceId === ws ? { ...a } : undefined;
  }
  async create(input: NewAgent, version: number): Promise<Agent> {
    const a: Agent = {
      id: `a${++this.seq}`,
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description ?? '',
      provider: input.provider,
      model: input.model,
      systemPrompt: input.systemPrompt,
      outputSchema: input.outputSchema ?? null,
      strategy: input.strategy ?? 'single-pass',
      ciFailOn: input.ciFailOn ?? 'critical',
      repoIntel: input.repoIntel ?? true,
      enabled: input.enabled ?? true,
      version,
      createdBy: input.createdBy ?? null,
      createdAt: new Date(0),
    };
    this.agents.set(a.id, a);
    return { ...a };
  }
  async save(a: Agent) {
    this.agents.set(a.id, { ...a });
    return { ...a };
  }
  async delete(ws: string, id: string) {
    return (await this.getById(ws, id)) ? this.agents.delete(id) : false;
  }
  async appendVersion(agentId: string, version: number, config: AgentConfigSnapshot) {
    this.versions.push({ agentId, version, config, createdAt: new Date(0) });
  }
  async listVersions(agentId: string) {
    return this.versions.filter((v) => v.agentId === agentId).sort((a, b) => b.version - a.version);
  }
  async getVersion(agentId: string, version: number) {
    return this.versions.find((v) => v.agentId === agentId && v.version === version);
  }
  async skillLinks(agentId: string) {
    return [...(this.links.get(agentId) ?? [])].sort((a, b) => a.order - b.order);
  }
  async linkSkill(agentId: string, skillId: string, order: number) {
    const rest = (this.links.get(agentId) ?? []).filter((l) => l.skillId !== skillId);
    this.links.set(agentId, [...rest, { skillId, order }]);
  }
  async setSkills(agentId: string, skillIds: string[]) {
    this.links.set(agentId, skillIds.map((skillId, order) => ({ skillId, order })));
  }

  snapshot() {
    return {
      agents: new Map([...this.agents].map(([k, v]) => [k, { ...v }])),
      versions: [...this.versions],
      links: new Map(this.links),
    };
  }
}

function setup() {
  const repo = new FakeAgents();
  const service = new AgentsService({
    agents: repo,
    uow: {
      async run(work) {
        const before = repo.snapshot();
        try {
          return await work({ agents: repo });
        } catch (e) {
          Object.assign(repo, before);
          throw e;
        }
      },
    },
    modelsFor: async (p) => {
      if (p === 'anthropic') throw new Error('no key');
      return { listModels: async () => [{ id: `${p}-m`, name: `${p}-m` }] as never };
    },
  });
  return { repo, service };
}

const input: NewAgent = {
  workspaceId: 'w1',
  name: 'Reviewer',
  provider: 'openai',
  model: 'gpt-4o-mini',
  systemPrompt: 'Review.',
};

describe('AgentsService', () => {
  it('create records the v1 snapshot', async () => {
    const { repo, service } = setup();
    const a = await service.create(input);
    expect(a.version).toBe(1);
    expect(repo.versions).toEqual([
      expect.objectContaining({ agentId: a.id, version: 1, config: expect.objectContaining({ skills: [] }) }),
    ]);
  });

  it('a config update bumps the version and snapshots the linked skills', async () => {
    const { repo, service } = setup();
    const a = await service.create(input);
    await service.setSkills('w1', a.id, ['s2', 's1']);
    const updated = await service.update('w1', a.id, { model: 'gpt-4o' });
    expect(updated.version).toBe(2);
    expect(await repo.getVersion(a.id, 2)).toMatchObject({
      config: { model: 'gpt-4o', skills: ['s2', 's1'] },
    });
  });

  it('toggling enabled does not snapshot', async () => {
    const { repo, service } = setup();
    const a = await service.create(input);
    const updated = await service.update('w1', a.id, { enabled: false });
    expect(updated).toMatchObject({ enabled: false, version: 1 });
    expect(repo.versions).toHaveLength(1);
  });

  it('a failed snapshot rolls the update back', async () => {
    const { repo, service } = setup();
    const a = await service.create(input);
    repo.appendVersion = () => Promise.reject(new Error('boom'));
    await expect(service.update('w1', a.id, { model: 'gpt-4o' })).rejects.toThrow('boom');
    expect((await service.get('w1', a.id)).model).toBe('gpt-4o-mini');
  });

  it('missing or foreign agents raise AgentNotFound everywhere', async () => {
    const { service } = setup();
    const a = await service.create(input);
    await expect(service.get('w2', a.id)).rejects.toBeInstanceOf(AgentNotFound);
    await expect(service.update('w2', a.id, { enabled: false })).rejects.toBeInstanceOf(AgentNotFound);
    await expect(service.delete('w2', a.id)).rejects.toBeInstanceOf(AgentNotFound);
    await expect(service.listVersions('w2', a.id)).rejects.toBeInstanceOf(AgentNotFound);
    await expect(service.skillLinks('w2', a.id)).rejects.toBeInstanceOf(AgentNotFound);
    await expect(service.setSkills('w2', a.id, [])).rejects.toBeInstanceOf(AgentNotFound);
    await expect(service.linkSkill('w2', a.id, 's1')).rejects.toBeInstanceOf(AgentNotFound);
  });

  it('getVersion raises AgentVersionNotFound for an unknown version', async () => {
    const { service } = setup();
    const a = await service.create(input);
    await expect(service.getVersion('w1', a.id, 99)).rejects.toBeInstanceOf(AgentVersionNotFound);
  });

  it('linkSkill appends after existing links when no order is given', async () => {
    const { service } = setup();
    const a = await service.create(input);
    await service.linkSkill('w1', a.id, 's1');
    const links = await service.linkSkill('w1', a.id, 's2');
    expect(links).toEqual([
      { skillId: 's1', order: 0 },
      { skillId: 's2', order: 1 },
    ]);
  });

  it('listModels degrades to [] when the provider is unavailable', async () => {
    const { service } = setup();
    expect(await service.listModels('anthropic')).toEqual([]);
    expect(await service.listModels('openai')).toHaveLength(1);
  });
});
