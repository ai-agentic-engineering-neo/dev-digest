import { describe, it, expect } from 'vitest';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import type { ReviewRepository } from '../src/modules/reviews/repository.js';
import type { Container } from '../src/platform/container.js';
import type { LinkedSkillRow } from '../src/modules/agents/repository.js';

/**
 * Focused unit coverage for `ReviewRunExecutor.resolveAgentSkills` — the glue
 * that turns an agent's linked skills (agent_skills ⋈ skills) into the
 * `SkillBlock[]` passed to `reviewPullRequest`. No DB/LLM involved: `agents`
 * and `container` are minimal fakes shaped to only what the method reads.
 */

/** A `skills` row with every field `resolveAgentSkills`/the type require, defaults overridable. */
function skillRow(overrides: Partial<LinkedSkillRow['skill']> = {}): LinkedSkillRow['skill'] {
  return {
    id: 'skill-id',
    workspaceId: 'ws-1',
    name: 'Unnamed skill',
    description: '',
    type: 'convention',
    source: 'manual',
    body: 'body',
    enabled: true,
    version: 1,
    evidenceFiles: null,
    createdAt: new Date(),
    ...overrides,
  } as LinkedSkillRow['skill'];
}

/** Build an executor whose `agents.linkedSkills` returns the given rows, and
 *  whose `container.tokenizer.count` is a deterministic stub (string length). */
function makeExecutor(links: LinkedSkillRow[]) {
  const agents = {
    linkedSkills: async () => links,
  } as unknown as Container['agentsRepo'];
  const container = {
    tokenizer: { count: (text: string) => text.length },
  } as unknown as Container;
  const repo = {} as ReviewRepository;
  return new ReviewRunExecutor(container, repo, agents);
}

/** `resolveAgentSkills` is private — called via a cast, same as the production call site. */
function resolveAgentSkills(executor: ReviewRunExecutor, agentId: string) {
  return (executor as unknown as { resolveAgentSkills(id: string): Promise<unknown> }).resolveAgentSkills(agentId);
}

describe('ReviewRunExecutor.resolveAgentSkills', () => {
  it('keeps only enabled skills, in agent_skills.order, and omits disabled ones', async () => {
    const links: LinkedSkillRow[] = [
      { order: 0, skill: skillRow({ id: 's1', name: 'First rubric', body: 'first body', enabled: true }) },
      { order: 1, skill: skillRow({ id: 's2', name: 'Disabled skill', body: 'disabled body', enabled: false }) },
      { order: 2, skill: skillRow({ id: 's3', name: 'Second rubric', body: 'second body', enabled: true }) },
    ];
    const executor = makeExecutor(links);

    const blocks = (await resolveAgentSkills(executor, 'agent-1')) as {
      name: string;
      body: string;
      tokens: number;
      untrusted: boolean;
    }[];

    expect(blocks.map((b) => b.name)).toEqual(['First rubric', 'Second rubric']);
    expect(blocks.find((b) => b.name === 'Disabled skill')).toBeUndefined();
  });

  it('marks a non-"manual" source skill untrusted, and a "manual" one trusted', async () => {
    const links: LinkedSkillRow[] = [
      { order: 0, skill: skillRow({ name: 'In-house rubric', body: 'trusted body', source: 'manual' }) },
      { order: 1, skill: skillRow({ name: 'Imported skill', body: 'imported body', source: 'imported_url' }) },
    ];
    const executor = makeExecutor(links);

    const blocks = (await resolveAgentSkills(executor, 'agent-1')) as {
      name: string;
      body: string;
      tokens: number;
      untrusted: boolean;
    }[];

    expect(blocks).toEqual([
      { name: 'In-house rubric', body: 'trusted body', tokens: 'trusted body'.length, untrusted: false },
      { name: 'Imported skill', body: 'imported body', tokens: 'imported body'.length, untrusted: true },
    ]);
  });

  it('uses container.tokenizer.count for each block\'s token count', async () => {
    const links: LinkedSkillRow[] = [
      { order: 0, skill: skillRow({ name: 'Rubric', body: 'twelve chars' }) },
    ];
    const executor = makeExecutor(links);

    const blocks = (await resolveAgentSkills(executor, 'agent-1')) as { tokens: number }[];

    expect(blocks[0].tokens).toBe('twelve chars'.length);
  });
});
