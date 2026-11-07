import { describe, it, expect } from 'vitest';
import { latestReviewFindings, type ReviewWithFindings } from '../src/modules/smart-diff/domain.js';

const d = (s: string) => new Date(s);

function row(
  id: string,
  agentId: string | null,
  createdAt: string,
  findings: { file: string; startLine: number; dismissed?: boolean }[],
  kind: 'summary' | 'review' = 'review',
): ReviewWithFindings {
  return {
    review: { id, agentId, kind, createdAt: d(createdAt) },
    findings: findings.map((f) => ({
      file: f.file,
      startLine: f.startLine,
      dismissedAt: f.dismissed ? d('2026-01-05T00:00:00Z') : null,
    })),
  };
}

describe('latestReviewFindings', () => {
  it('keeps only the latest kind=review per agent, merged, without dismissed', () => {
    const rows = [
      row('a1', 'A', '2026-01-01T00:00:00Z', [{ file: 'a.ts', startLine: 3 }]),
      row('a2', 'A', '2026-01-02T00:00:00Z', [
        { file: 'a.ts', startLine: 10 },
        { file: 'a.ts', startLine: 11, dismissed: true },
      ]),
      row('b1', 'B', '2026-01-01T00:00:00Z', [{ file: 'b.ts', startLine: 20 }]),
      row('s1', 'A', '2026-01-03T00:00:00Z', [{ file: 'a.ts', startLine: 99 }], 'summary'),
      row('n1', null, '2026-01-01T00:00:00Z', [{ file: 'n.ts', startLine: 50 }]),
      row('n2', null, '2026-01-02T00:00:00Z', [{ file: 'n.ts', startLine: 60 }]),
    ];
    const lines = latestReviewFindings(rows).map((f) => `${f.file}:${f.startLine}`).sort();
    expect(lines).toEqual(['a.ts:10', 'b.ts:20', 'n.ts:60']);
  });

  it('returns [] for empty input', () => {
    expect(latestReviewFindings([])).toEqual([]);
  });

  it('breaks createdAt ties by higher id', () => {
    const rows = [
      row('r1', 'A', '2026-01-01T00:00:00Z', [{ file: 'a.ts', startLine: 1 }]),
      row('r2', 'A', '2026-01-01T00:00:00Z', [{ file: 'a.ts', startLine: 2 }]),
    ];
    expect(latestReviewFindings(rows)).toEqual([{ file: 'a.ts', startLine: 2 }]);
    expect(latestReviewFindings([...rows].reverse())).toEqual([{ file: 'a.ts', startLine: 2 }]);
  });
});
