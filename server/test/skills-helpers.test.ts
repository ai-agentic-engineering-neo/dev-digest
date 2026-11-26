import { describe, it, expect } from 'vitest';
import {
  isBodyChange,
  isUniqueViolation,
  normalizeToken,
  rankAgentSuggestions,
  scoreAgentForSkill,
  stripCodeFences,
  suggestionTokens,
  type SuggestionAgent,
  type SuggestionSkill,
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

// ---- agent suggestions (plan §D, F16) ---------------------------------------

const skill = (over: Partial<SuggestionSkill> = {}): SuggestionSkill => ({
  name: 'payments-api-conventions',
  description: '',
  body: '# payments-api-conventions',
  type: 'convention',
  categories: [],
  ...over,
});
const agent = (over: Partial<SuggestionAgent> = {}): SuggestionAgent => ({
  id: 'a1',
  name: 'Some Reviewer',
  description: '',
  linkedSkillTypes: {},
  ...over,
});

describe('suggestion tokens', () => {
  it('singularizes, drops stop-words, short and numeric tokens, keeps the first spelling', () => {
    expect(normalizeToken('errors')).toBe('error');
    expect(normalizeToken('dependencies')).toBe('dependency');
    expect(normalizeToken('classes')).toBe('class');
    expect(normalizeToken('class')).toBe('class');
    const tokens = suggestionTokens('The API reviewer checks Errors, error codes and 404 for v2 rules');
    expect([...tokens.keys()]).toEqual(['api', 'check', 'error']);
    expect(tokens.get('error')).toBe('errors');
  });

  it('strips fenced code of any fence length', () => {
    const body = 'Use Result\n\n````ts\nconst fooBarQux = 1;\n```inner```\n````\nafter';
    expect(stripCodeFences(body)).not.toContain('fooBarQux');
    expect(stripCodeFences(body)).toContain('after');
  });

  it('a longer closing fence closes; text between two blocks survives', () => {
    expect(stripCodeFences('a\n```ts\nX\n````\nb\n```\nY\n```\nc')).toBe('a\nb\nc');
    // ~~~ does not close ```, nor does a fence with an info string
    expect(stripCodeFences('a\n```\nX\n~~~\n```js\nY\n```\nb')).toBe('a\nb');
  });

  it('an indented fence (inside a list item) and an unclosed fence are stripped too', () => {
    expect(stripCodeFences('- item\n  ```ts\n  hidden1\n  ```\n- next')).toBe('- item\n- next');
    expect(stripCodeFences('keep\n```\nhidden2\nhidden3')).toBe('keep');
  });
});

describe('scoreAgentForSkill', () => {
  it('category: matched share of the skill categories (general ignored), with the reason', () => {
    const s = skill({ categories: ['errors', 'api', 'general'] });
    const r = scoreAgentForSkill(s, agent({ name: 'Error Hunter', description: 'Finds unhandled exceptions' }));
    expect(r.score).toBe(0.2); // 0.4 × 1/2
    expect(r.reasons).toEqual([{ kind: 'category', categories: ['errors'] }]);
  });

  it('type: same-type links saturate at 2; custom skills give no type signal', () => {
    const one = scoreAgentForSkill(skill({ type: 'security' }), agent({ linkedSkillTypes: { security: 1 } }));
    expect(one).toEqual({ score: 0.15, reasons: [{ kind: 'type', type: 'security', count: 1 }] });
    const three = scoreAgentForSkill(skill({ type: 'security' }), agent({ linkedSkillTypes: { security: 3 } }));
    expect(three.score).toBe(0.3);
    expect(three.reasons).toEqual([{ kind: 'type', type: 'security', count: 3 }]);
    expect(scoreAgentForSkill(skill({ type: 'custom' }), agent({ linkedSkillTypes: { custom: 5 } })).score).toBe(0);
  });

  it('keywords: shared words of skill name/description/body (no code) ↔ agent name/description', () => {
    const s = skill({
      categories: ['naming'],
      description: 'Schema validation for endpoints',
      body: '## Api\n\n### Validate every request\n```ts\nconst contract = z.object({});\n```',
    });
    const r = scoreAgentForSkill(
      s,
      agent({ name: 'API Contract Reviewer', description: 'Checks endpoint schemas and request validation' }),
    );
    // contract is only in the code fence → not shared
    expect(r.reasons).toEqual([{ kind: 'keywords', keywords: ['api', 'endpoint', 'schemas', 'request', 'validation'] }]);
    expect(r.score).toBe(0.3); // categories present → keywords weight 0.3, saturated
  });

  it('a skill without categories moves the category weight to keywords', () => {
    const s = skill({ type: 'custom', name: 'sql-injection', description: 'Parameterized queries only' });
    const two = scoreAgentForSkill(s, agent({ description: 'Flags SQL injection' }));
    expect(two.score).toBe(0.47); // 0.7 × 2/3
    const three = scoreAgentForSkill(s, agent({ description: 'Flags SQL injection in raw queries' }));
    expect(three.score).toBe(0.7);
  });

  it('all three signals add up', () => {
    const r = scoreAgentForSkill(
      skill({ categories: ['errors'], description: 'Error handling for the payments api' }),
      agent({ name: 'Payments API Error Reviewer', linkedSkillTypes: { convention: 2 } }),
    );
    expect(r.score).toBe(1); // 0.4 + 0.3 + 0.3 (payment, api, error)
    expect(r.reasons.map((x) => x.kind)).toEqual(['category', 'type', 'keywords']);
  });
});

describe('rankAgentSuggestions', () => {
  it('hides zero scores, sorts by score then name, preselects at ≥ 0.5, keeps at most 10', () => {
    const s = skill({ categories: ['errors'], description: 'error handling' });
    const agents = [
      agent({ id: 'none', name: 'Docs Reviewer' }),
      agent({ id: 'b', name: 'B Error Reviewer' }),
      agent({ id: 'a', name: 'A Error Reviewer' }),
      agent({ id: 'top', name: 'Z Error Reviewer', linkedSkillTypes: { convention: 2 } }),
      ...Array.from({ length: 12 }, (_, i) => agent({ id: `x${i}`, name: `X${String(i).padStart(2, '0')} payments` })),
    ];
    const out = rankAgentSuggestions(s, agents);
    expect(out).toHaveLength(10);
    expect(out.map((x) => x.agent_id).slice(0, 3)).toEqual(['top', 'a', 'b']);
    expect(out.find((x) => x.agent_id === 'none')).toBeUndefined();
    // top: category 0.4 + type 0.3 + 1 shared word 0.1; a/b: 0.4 + 0.1 (tie → by name); X: 1 shared word.
    expect(out[0]).toMatchObject({ agent_name: 'Z Error Reviewer', score: 0.8, preselected: true });
    expect(out[1]).toMatchObject({ agent_name: 'A Error Reviewer', score: 0.5, preselected: true });
    expect(out[3]).toMatchObject({ agent_name: 'X00 payments', score: 0.1, preselected: false });
  });
});
