import { describe, it, expect } from 'vitest';
import type { Finding, Review } from '@devdigest/shared';
import { reduceReviews, scoreFromFindings } from '../src/review/reduce.js';

function finding(severity: Finding['severity'], id = severity): Finding {
  return {
    id,
    severity,
    category: 'bug',
    title: `${severity} thing`,
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.9,
    kind: 'finding',
  } as Finding;
}

const review = (over: Partial<Review>): Review => ({
  verdict: 'approve',
  score: 100,
  summary: '',
  findings: [],
  ...over,
});

describe('scoreFromFindings', () => {
  it('no findings → 100', () => {
    expect(scoreFromFindings([])).toBe(100);
  });
  it('applies the per-severity penalty', () => {
    expect(scoreFromFindings([finding('SUGGESTION')])).toBe(97);
    expect(scoreFromFindings([finding('WARNING')])).toBe(88);
    expect(scoreFromFindings([finding('CRITICAL')])).toBe(65);
    expect(scoreFromFindings([finding('CRITICAL'), finding('WARNING'), finding('SUGGESTION')])).toBe(50);
  });
  it('clamps at 0', () => {
    expect(scoreFromFindings(Array.from({ length: 5 }, (_, i) => finding('CRITICAL', `c${i}`)))).toBe(0);
  });
});

describe('reduceReviews', () => {
  it('a single partial is returned as-is', () => {
    const only = review({ verdict: 'comment', score: 42, summary: 'x' });
    expect(reduceReviews([only])).toBe(only);
  });

  it('worst verdict wins, findings are concatenated in partial order', () => {
    const a = review({ verdict: 'comment', findings: [finding('WARNING', 'a1')] });
    const b = review({ verdict: 'request_changes', findings: [finding('CRITICAL', 'b1')] });
    const c = review({ verdict: 'approve', findings: [finding('SUGGESTION', 'c1')] });
    const r = reduceReviews([a, b, c]);
    expect(r.verdict).toBe('request_changes');
    expect(r.findings.map((f) => f.id)).toEqual(['a1', 'b1', 'c1']);
  });

  it('all approve → approve', () => {
    expect(reduceReviews([review({}), review({})]).verdict).toBe('approve');
  });

  it('score is the rounded mean; empty summaries are skipped when joining', () => {
    const r = reduceReviews([
      review({ score: 90, summary: 'first.' }),
      review({ score: 81, summary: '' }),
      review({ score: 70, summary: 'third.' }),
    ]);
    expect(r.score).toBe(80); // (90+81+70)/3 = 80.33
    expect(r.summary).toBe('first. third.');
  });

  it('zero partials → empty approve with score 0', () => {
    expect(reduceReviews([])).toEqual({ verdict: 'approve', score: 0, summary: '', findings: [] });
  });
});
