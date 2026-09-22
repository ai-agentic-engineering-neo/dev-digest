import { describe, it, expect } from 'vitest';
import type { Agent, AgentSkillLink, LLMProvider } from '@devdigest/shared';
import { isConfigChange, type AgentConfigFields } from '../src/modules/agents/domain.js';
import { AgentsService, type AgentsStore } from '../src/modules/agents/service.js';

const existing: AgentConfigFields = {
  name: 'Reviewer',
  description: '',
  provider: 'openai',
  model: 'gpt-4o-mini',
  systemPrompt: 'Review.',
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: true,
};

describe('isConfigChange (agents domain)', () => {
  it('toggling only `enabled` is not a config change', () => {
    expect(isConfigChange(existing, { enabled: false })).toBe(false);
  });

  it('re-sending unchanged values is not a config change', () => {
    expect(isConfigChange(existing, { name: 'Reviewer', model: 'gpt-4o-mini', repoIntel: true })).toBe(false);
  });

  it.each([
    [{ name: 'Other' }],
    [{ model: 'gpt-4o' }],
    [{ systemPrompt: 'Be strict.' }],
    [{ ciFailOn: 'major' as const }],
    [{ repoIntel: false }],
    // output_schema is not compared deeply: any value counts as a change.
    [{ outputSchema: { type: 'object' } }],
  ])('%o is a config change', (patch) => {
    expect(isConfigChange(existing, patch)).toBe(true);
  });
});

/** In-memory AgentsStore: one workspace-scoped agent + ordered skill links. */
function fakeStore(): AgentsStore & { links: AgentSkillLink[] } {
  const agent = { id: 'a1', name: 'Reviewer' } as Agent;
  const links: AgentSkillLink[] = [];
  const find = async (ws: string, id: string) => (ws === 'ws1' && id === 'a1' ? agent : undefined);
  return {
    links,
    listAgents: async (ws) => (ws === 'ws1' ? [agent] : []),
    findAgent: find,
    createAgent: async () => agent,
    updateAgent: async (ws, id) => find(ws, id),
    deleteById: async (ws, id) => (await find(ws, id)) !== undefined,
    listAgentVersions: async () => [],
    findAgentVersion: async () => undefined,
    skillLinks: async () => [...links].sort((a, b) => a.order - b.order),
    setSkills: async (agentId, ids) => {
      links.splice(0, links.length, ...ids.map((skill_id, order) => ({ agent_id: agentId, skill_id, order })));
    },
    linkSkill: async (agentId, skillId, order) => {
      links.push({ agent_id: agentId, skill_id: skillId, order });
    },
  };
}

describe('AgentsService (ports faked)', () => {
  const noLlm = async (): Promise<LLMProvider> => {
    throw new Error('OPENAI_API_KEY is not configured');
  };

  it('linkSkill appends at the end when no order is given', async () => {
    const agents = fakeStore();
    const service = new AgentsService({ agents, llm: noLlm });
    await service.setSkills('ws1', 'a1', ['s1', 's2']);
    const links = await service.linkSkill('ws1', 'a1', 's3');
    expect(links?.map((l) => [l.skill_id, l.order])).toEqual([
      ['s1', 0],
      ['s2', 1],
      ['s3', 2],
    ]);
  });

  it('skill and version reads are workspace-scoped (undefined → 404 at the route)', async () => {
    const agents = fakeStore();
    const service = new AgentsService({ agents, llm: noLlm });
    expect(await service.setSkills('other-ws', 'a1', ['s1'])).toBeUndefined();
    expect(agents.links).toHaveLength(0);
    expect(await service.listVersions('other-ws', 'a1')).toBeUndefined();
  });

  it('listModels degrades to [] when the provider key is missing', async () => {
    const service = new AgentsService({ agents: fakeStore(), llm: noLlm });
    await expect(service.listModels('openai')).resolves.toEqual([]);
  });
});
