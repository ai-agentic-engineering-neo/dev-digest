import { describe, expect, it } from 'vitest';
import { isConfigChange, toSkillDto } from './helpers.js';

const existing = {
  name: 'pr-quality-rubric',
  description: 'Flag low-signal PRs.',
  type: 'rubric' as const,
  body: '# Rubric\nBe brief.',
};

describe('isConfigChange', () => {
  it('is true when name, description, type, or body changes', () => {
    expect(isConfigChange(existing, { name: 'other' })).toBe(true);
    expect(isConfigChange(existing, { description: 'Do not pad findings.' })).toBe(true);
    expect(isConfigChange(existing, { type: 'custom' })).toBe(true);
    expect(isConfigChange(existing, { body: '# Rubric\nCap at 5.' })).toBe(true);
  });

  it('is false for an enabled-only patch and for a no-op config patch', () => {
    expect(isConfigChange(existing, {})).toBe(false);
    expect(isConfigChange(existing, { name: existing.name })).toBe(false);
    expect(isConfigChange(existing, { body: existing.body })).toBe(false);
  });
});

describe('toSkillDto', () => {
  it('maps agentCount onto agent_count', () => {
    const dto = toSkillDto(
      {
        id: 's1',
        workspaceId: 'w1',
        name: 'uncovered-branches',
        description: 'Flag gaps.',
        type: 'custom',
        source: 'manual',
        body: '# Body',
        enabled: true,
        version: 2,
        evidenceFiles: null,
        createdAt: new Date('2026-09-19T00:00:00Z'),
      },
      3,
    );
    expect(dto.agent_count).toBe(3);
    expect(dto.version).toBe(2);
  });
});
