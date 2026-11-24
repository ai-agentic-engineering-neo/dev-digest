import { describe, it, expect } from 'vitest';
import {
  applyAgentPatch,
  configSnapshotOf,
  isConfigChange,
} from '../src/modules/agents/domain/policies.js';
import type { Agent } from '../src/modules/agents/domain/types.js';

const agent: Agent = {
  id: 'a1',
  workspaceId: 'w1',
  name: 'Reviewer',
  description: '',
  provider: 'openai',
  model: 'gpt-4o-mini',
  systemPrompt: 'Review.',
  outputSchema: null,
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: true,
  enabled: true,
  version: 3,
  createdBy: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('agents policies', () => {
  it.each([
    ['model change', { model: 'gpt-4o' }, true],
    ['same model', { model: 'gpt-4o-mini' }, false],
    ['enabled toggle only', { enabled: false }, false],
    ['empty patch', {}, false],
    ['output schema present (even if equal)', { outputSchema: null }, true],
    ['strategy change', { strategy: 'map-reduce' as const }, true],
  ])('isConfigChange: %s → %s', (_label, patch, expected) => {
    expect(isConfigChange(agent, patch)).toBe(expected);
  });

  it('applyAgentPatch bumps the version on a config change', () => {
    const { next, versionBumped } = applyAgentPatch(agent, { model: 'gpt-4o' });
    expect(versionBumped).toBe(true);
    expect(next).toMatchObject({ model: 'gpt-4o', version: 4 });
  });

  it('applyAgentPatch keeps the version and ignores undefined fields on a toggle', () => {
    const { next, versionBumped } = applyAgentPatch(agent, { enabled: false, model: undefined });
    expect(versionBumped).toBe(false);
    expect(next).toEqual({ ...agent, enabled: false });
  });

  it('configSnapshotOf captures config fields and skills, not identity/enabled', () => {
    expect(configSnapshotOf(agent, ['s1', 's2'])).toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'Review.',
      outputSchema: null,
      strategy: 'single-pass',
      ciFailOn: 'critical',
      repoIntel: true,
      skills: ['s1', 's2'],
    });
  });
});
