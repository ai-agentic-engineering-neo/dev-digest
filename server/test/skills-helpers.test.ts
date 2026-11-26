import { describe, it, expect } from 'vitest';
import {
  isBodyChange,
  isUniqueViolation,
  rate,
  toAgentActivity,
  toSkillDto,
  toSkillVersionDto,
  versionMessage,
  windowStart,
} from '../src/modules/skills/helpers.js';

const created = new Date('2026-11-01T10:00:00.000Z');
const updated = new Date('2026-11-20T12:30:00.000Z');

describe('skills helpers', () => {
  it('toSkillDto maps a record to the Skill contract with agent_count', () => {
    const dto = toSkillDto(
      {
        id: 's1',
        name: 'secret-leakage-gate',
        description: 'No secrets',
        type: 'security',
        source: 'manual',
        body: '# Gate',
        enabled: true,
        version: 3,
        evidenceFiles: null,
        createdAt: created,
        updatedAt: updated,
      },
      2,
    );
    expect(dto).toEqual({
      id: 's1',
      name: 'secret-leakage-gate',
      description: 'No secrets',
      type: 'security',
      source: 'manual',
      body: '# Gate',
      enabled: true,
      version: 3,
      evidence_files: null,
      created_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-20T12:30:00.000Z',
      agent_count: 2,
    });
  });

  it('toSkillVersionDto maps a version record', () => {
    expect(
      toSkillVersionDto({ skillId: 's1', version: 2, body: 'b', message: 'Tighten', createdAt: created }),
    ).toEqual({ skill_id: 's1', version: 2, body: 'b', message: 'Tighten', created_at: created.toISOString() });
  });

  it('isBodyChange: only a present, different body counts', () => {
    expect(isBodyChange('a', undefined)).toBe(false);
    expect(isBodyChange('a', 'a')).toBe(false);
    expect(isBodyChange('a', 'b')).toBe(true);
  });

  it('versionMessage: defaults per kind, user text trimmed, blank → Edited body', () => {
    expect(versionMessage({ kind: 'initial' })).toBe('Initial version');
    expect(versionMessage({ kind: 'edit' })).toBe('Edited body');
    expect(versionMessage({ kind: 'edit', message: '   ' })).toBe('Edited body');
    expect(versionMessage({ kind: 'edit', message: '  Tighten ' })).toBe('Tighten');
    expect(versionMessage({ kind: 'restore', from: 4 })).toBe('Restored from v4');
  });

  it('rate: null on a zero denominator', () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(3, 4)).toBe(0.75);
    expect(rate(0, 2)).toBe(0);
  });

  it('toAgentActivity: zeros + null rate without counts; rate over decided findings only', () => {
    const agent = { agent_id: 'a1', agent_name: 'Security Reviewer', enabled: false };
    expect(toAgentActivity(agent, undefined)).toEqual({
      ...agent,
      runs_30d: 0,
      findings_30d: 0,
      accept_rate_30d: null,
    });
    expect(
      toAgentActivity(agent, { runs: 2, findings: 5, accepted: 1, dismissed: 3 }).accept_rate_30d,
    ).toBe(0.25);
  });

  it('windowStart subtracts whole days', () => {
    expect(windowStart(new Date('2026-11-30T00:00:00.000Z'), 30).toISOString()).toBe(
      '2026-10-31T00:00:00.000Z',
    );
  });

  it('isUniqueViolation finds 23505 directly or in the cause chain', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    const wrapped = new Error('Failed query', { cause: { code: '23505' } });
    expect(isUniqueViolation(wrapped)).toBe(true);
    expect(isUniqueViolation(new Error('x', { cause: { code: '23503' } }))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
