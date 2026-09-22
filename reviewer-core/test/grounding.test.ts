/**
 * groundFindings — the citation gate. Pins keep/drop semantics and that a
 * model-supplied line range can never make the gate loop over the range
 * itself (end_line 1e12 used to hang the request).
 */
import { describe, it, expect } from 'vitest';
import type { Finding, UnifiedDiff } from '@devdigest/shared';
import { groundFindings } from '../src/index.js';

function finding(start: number, end: number, file = 'src/a.ts'): Finding {
  return {
    id: `f-${start}-${end}`,
    severity: 'WARNING',
    category: 'security',
    title: 't',
    file,
    start_line: start,
    end_line: end,
    rationale: 'r',
  } as Finding;
}

const diff: UnifiedDiff = {
  raw: '',
  files: [
    {
      path: 'src/a.ts',
      additions: 3,
      deletions: 0,
      hunks: [
        { file: 'src/a.ts', oldStart: 10, oldLines: 0, newStart: 10, newLines: 3, newLineNumbers: [10, 11, 12] },
      ],
    },
  ],
};

describe('groundFindings', () => {
  it('keeps a finding whose range intersects a hunk line', () => {
    const r = groundFindings([finding(9, 10)], diff);
    expect(r.kept).toHaveLength(1);
    expect(r.dropped).toHaveLength(0);
  });

  it('drops a finding whose range misses every hunk line', () => {
    const r = groundFindings([finding(1, 9), finding(13, 20)], diff);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped).toHaveLength(2);
  });

  it('accepts a reversed start/end range', () => {
    expect(groundFindings([finding(12, 5)], diff).kept).toHaveLength(1);
    expect(groundFindings([finding(30, 20)], diff).kept).toHaveLength(0);
  });

  it('returns fast for a huge range (no per-line loop over the range)', () => {
    const t0 = performance.now();
    const r = groundFindings([finding(1, 1e12), finding(100, 1e12)], diff);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(50);
    expect(r.kept.map((f) => f.start_line)).toEqual([1]);
    expect(r.dropped).toHaveLength(1);
  });

  it('drops non-finite or negative ranges instead of trusting them', () => {
    const bad = [finding(NaN, 11), finding(10, Infinity), finding(-Infinity, 11), finding(-5, -1)];
    const r = groundFindings(bad, diff);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped).toHaveLength(4);
  });
});
