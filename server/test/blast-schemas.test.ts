import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BlastRadiusResponse } from '../src/modules/blast/schemas.js';
import type { PrBlastRadius } from '../src/modules/blast/domain/types.js';

const fixture: unknown = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/blast-radius-response.json'), 'utf8'),
);

/** Recursive sorted key structure; arrays are represented by their first element. */
function keyShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length > 0 ? [keyShape(value[0])] : [];
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) out[k] = keyShape((value as Record<string, unknown>)[k]);
    return out;
  }
  return value === null ? 'null' : typeof value;
}

// tsc rejects extra or missing fields here.
const sample: PrBlastRadius = {
  pr_id: '6f1c1a52-3b0e-4a57-9c1d-2f6a8b7d9e10',
  head_sha: 'a',
  indexed_sha: 'b',
  link_sha: 'b',
  changed_symbols: [{ name: 'n', file: 'f', kind: 'k' }],
  downstream: [
    {
      symbol: 's',
      file: 'f',
      kind: 'k',
      callers: [{ name: 'c', file: 'f', line: 1 }],
      endpoints_affected: ['e'],
      crons_affected: ['c'],
    },
  ],
  unattributed_endpoints: ['u'],
  summary: 's',
  counts: { symbols: 1, callers: 1, endpoints: 1, crons: 1 },
  callers_omitted: 0,
  degraded: false,
  reason: null,
};

describe('BlastRadiusResponse', () => {
  it('parses the golden fixture without dropping keys', () => {
    expect(BlastRadiusResponse.parse(fixture)).toEqual(fixture);
  });

  it('fixture has the same key shape as the typed PrBlastRadius sample', () => {
    expect(keyShape(sample)).toEqual(keyShape(fixture));
  });

  it.each([
    ['unknown reason', (f: Record<string, unknown>) => ({ ...f, degraded: true, reason: 'oops' })],
    ['missing counts', (f: Record<string, unknown>) => ({ ...f, counts: undefined })],
    ['missing link_sha', (f: Record<string, unknown>) => ({ ...f, link_sha: undefined })],
    ['non-uuid pr_id', (f: Record<string, unknown>) => ({ ...f, pr_id: 'nope' })],
    ['degraded without a reason', (f: Record<string, unknown>) => ({ ...f, degraded: true, reason: null })],
    ['a reason while not degraded', (f: Record<string, unknown>) => ({ ...f, degraded: false, reason: 'no_data' })],
  ])('rejects %s', (_name, mutate) => {
    const base = fixture as Record<string, unknown>;
    expect(BlastRadiusResponse.safeParse(mutate(base)).success).toBe(false);
  });
});
