import { describe, it, expect } from 'vitest';
import { aggregatePrFindings, type FindingRow, type ReviewRow } from './findings.js';

const d = (s: string) => new Date(s);
const rv = (id: string, agentId: string, at: string, prId = 'pr1'): ReviewRow => ({
  id, prId, agentId, createdAt: d(at),
});
const fd = (id: string, reviewId: string, o: Partial<FindingRow> = {}): FindingRow => ({
  id, reviewId, severity: 'WARNING', category: 'perf', title: id, file: 'a.ts',
  startLine: 1, endLine: 2, confidence: 0.9, rationale: 'r', kind: 'finding', dismissedAt: null, ...o,
});

describe('aggregatePrFindings', () => {
  it('uses only the newest review per agent (re-runs replace, not add)', () => {
    const out = aggregatePrFindings(
      [rv('old', 'a1', '2026-01-01'), rv('new', 'a1', '2026-01-02'), rv('other', 'a2', '2026-01-01')],
      [fd('f-old', 'old'), fd('f-new', 'new'), fd('f-other', 'other')],
    );
    expect(out.get('pr1')!.map((f) => f.id).sort()).toEqual(['f-new', 'f-other']);
  });

  it('skips dismissed and non-finding kinds', () => {
    const out = aggregatePrFindings(
      [rv('r', 'a1', '2026-01-01')],
      [fd('ok', 'r'), fd('x', 'r', { dismissedAt: d('2026-01-03') }), fd('t', 'r', { kind: 'lethal_trifecta' })],
    );
    expect(out.get('pr1')!.map((f) => f.id)).toEqual(['ok']);
  });

  it('truncates long rationale and omits PRs without findings', () => {
    const out = aggregatePrFindings([rv('r', 'a1', '2026-01-01')], [fd('long', 'r', { rationale: 'x'.repeat(500) })]);
    expect(out.get('pr1')![0]!.rationale.length).toBe(240);
    expect(out.get('pr2')).toBeUndefined();
  });
});
