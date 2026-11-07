import { describe, it, expect } from 'vitest';
import { IntentOverrideBody, IntentSourceList, PrIntentOrNull, PrIntentResponse, parseIntentSources } from '../src/modules/intent/schemas.js';
import type { IntentSource, PrIntent } from '../src/modules/intent/domain/types.js';

const source: IntentSource = {
  id: 'issue:12',
  kind: 'issue',
  ref: '#12',
  weight: 'strong',
  status: 'read',
  reason: null,
  used: true,
  cited: true,
  issue_number: 12,
  path: null,
};

const sample: PrIntent = {
  pr_id: '2f1c2d0e-8b1a-4c1e-9a53-0d6f2f6a7b11',
  status: 'ok',
  origin: 'derived',
  intent: 'Add retry to webhook delivery',
  in_scope: ['retry loop'],
  out_of_scope: ['metrics'],
  kind: 'feature',
  confidence: 'high',
  confidence_reason: 'substantive_body',
  confidence_lowered: false,
  sources: [source],
  head_sha: 'abc123',
  stale: false,
  stale_reason: null,
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.001,
  error: null,
  updated_at: '2026-11-06T00:00:00.000Z',
};

describe('intent schemas', () => {
  it('parses a full PrIntent and null', () => {
    expect(PrIntentResponse.parse(sample)).toEqual(sample);
    expect(PrIntentOrNull.parse(null)).toBeNull();
  });

  it('IntentOverrideBody trims items', () => {
    const r = IntentOverrideBody.parse({ intent: '  do x  ', in_scope: ['  a  '], out_of_scope: [] });
    expect(r).toEqual({ intent: 'do x', in_scope: ['a'], out_of_scope: [] });
  });

  it('IntentOverrideBody rejects invalid input', () => {
    const ok = { intent: 'x', in_scope: [], out_of_scope: [] };
    expect(IntentOverrideBody.safeParse({ ...ok, intent: '   ' }).success).toBe(false);
    expect(IntentOverrideBody.safeParse({ ...ok, intent: 'a'.repeat(401) }).success).toBe(false);
    expect(IntentOverrideBody.safeParse({ ...ok, in_scope: Array(9).fill('a') }).success).toBe(false);
    expect(IntentOverrideBody.safeParse({ ...ok, out_of_scope: ['a'.repeat(161)] }).success).toBe(false);
    expect(IntentOverrideBody.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });

  it('IntentSourceList rejects an unknown status', () => {
    expect(IntentSourceList.safeParse([{ ...source, status: 'bogus' }]).success).toBe(false);
    expect(IntentSourceList.safeParse([source]).success).toBe(true);
  });
});

describe('parseIntentSources', () => {
  const second: IntentSource = { ...source, id: 'issue:13', ref: '#13', issue_number: 13 };

  it('drops only the invalid entry and keeps the valid ones in order', () => {
    const bad = { ...source, id: 'issue:0', issue_number: 0 };
    expect(parseIntentSources([source, bad, second])).toEqual([source, second]);
  });

  it('returns all entries unchanged when every one is valid', () => {
    expect(parseIntentSources([source, second])).toEqual([source, second]);
  });

  it('returns [] for null, an object and undefined', () => {
    expect(parseIntentSources(null)).toEqual([]);
    expect(parseIntentSources({})).toEqual([]);
    expect(parseIntentSources(undefined)).toEqual([]);
  });
});
