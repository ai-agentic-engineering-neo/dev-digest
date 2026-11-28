/**
 * M2 link use cases on in-memory ports: `updateLinks` dispatches a `{skills}`
 * body to a full replace and a `{skill_id}` body to an upsert that keeps the
 * other links; `skillLinks` merges the link columns with the skills module's
 * name/type/flag. And `SkillsService.effectiveSkills` composes the agents
 * port's ordered link ids with the globally enabled skills, keeping link order.
 */
import { describe, it, expect } from 'vitest';
import type { Agent } from '@devdigest/shared';
import { AgentsService } from '../src/modules/agents/service.js';
import type { AgentStore, LinkSpec, SkillLink } from '../src/modules/agents/ports.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { EffectiveSkill, SkillStore } from '../src/modules/skills/ports.js';

const WS = 'ws-1';
const AGENT = { id: 'agent-1' } as Agent;

function agentsSetup(initial: LinkSpec[]) {
  let links: LinkSpec[] = initial;
  const writes: LinkSpec[][] = [];
  const store = {
    getById: async (ws: string, id: string) => (ws === WS && id === AGENT.id ? AGENT : undefined),
    linkedSkills: async (): Promise<SkillLink[]> => links.map((l, order) => ({ ...l, order })),
    setSkills: async (_id: string, next: LinkSpec[]) => {
      writes.push(next);
      links = next;
    },
  } as unknown as AgentStore;
  const service = new AgentsService({
    agents: store,
    models: async () => ({ listModels: async () => [] }),
    skills: {
      existingIds: async (_ws, ids) => [...ids],
      summaries: async (_ws, ids) =>
        ids.map((id) => ({ id, name: `name-${id}`, type: 'custom' as const, enabled: id !== 's2' })),
    },
  });
  return { service, writes };
}

describe('AgentsService.updateLinks', () => {
  it('a {skills} body replaces the whole ordered set', async () => {
    const { service, writes } = agentsSetup([{ skillId: 's1', enabled: true }]);
    const out = await service.updateLinks(WS, AGENT.id, {
      skills: [
        { skill_id: 's2', enabled: true },
        { skill_id: 's3', enabled: false },
      ],
    });
    expect(writes).toEqual([[{ skillId: 's2', enabled: true }, { skillId: 's3', enabled: false }]]);
    expect(out).toEqual([
      { agent_id: AGENT.id, skill_id: 's2', order: 0, enabled: true, name: 'name-s2', type: 'custom', skill_enabled: false },
      { agent_id: AGENT.id, skill_id: 's3', order: 1, enabled: false, name: 'name-s3', type: 'custom', skill_enabled: true },
    ]);
  });

  it('a {skill_id} body links one skill and keeps the others; an unknown agent gives undefined', async () => {
    const { service, writes } = agentsSetup([{ skillId: 's1', enabled: true }]);
    await service.updateLinks(WS, AGENT.id, { skill_id: 's2', order: 0 });
    expect(writes).toEqual([[{ skillId: 's2', enabled: true }, { skillId: 's1', enabled: true }]]);
    expect(await service.updateLinks(WS, 'missing', { skill_id: 's2' })).toBeUndefined();
  });
});

describe('SkillsService.effectiveSkills', () => {
  it('keeps link order and drops ids the skills store does not return (globally disabled)', async () => {
    const skill = (id: string): EffectiveSkill => ({ id, name: id, description: 'd', type: 'custom', body: 'b', version: 1 });
    const service = new SkillsService({
      // The store answers in its own order and omits the disabled skill.
      skills: { enabledByIds: async () => [skill('a'), skill('c')] } as unknown as SkillStore,
      links: { enabledSkillIds: async () => ['c', 'off', 'a'], enabledLinkCounts: async () => new Map() },
      tokens: { count: () => 0 },
      archive: { list: () => [], inflate: () => new Uint8Array() },
      frontmatter: { parse: () => ({}) },
    });
    expect((await service.effectiveSkills('agent-1')).map((s) => s.id)).toEqual(['c', 'a']);
  });
});
