import { describe, it, expect } from 'vitest';
import type { Finding, Review, UnifiedDiff } from '@devdigest/shared';
import { reduceReviews, scoreFromFindings, sliceDiff } from '../src/review/reduce.js';

const finding = (severity: Finding['severity'], id = severity): Finding =>
  ({
    id,
    severity,
    category: 'correctness',
    title: id,
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.9,
  }) as Finding;

const review = (over: Partial<Review>): Review => ({
  verdict: 'approve',
  summary: '',
  score: 100,
  findings: [],
  ...over,
});

describe('scoreFromFindings', () => {
  it('is 100 with no findings and drops by severity', () => {
    expect(scoreFromFindings([])).toBe(100);
    expect(scoreFromFindings([finding('SUGGESTION')])).toBe(97);
    expect(scoreFromFindings([finding('WARNING')])).toBe(88);
    expect(scoreFromFindings([finding('CRITICAL')])).toBe(65);
  });

  it('never goes below 0', () => {
    const many = Array.from({ length: 5 }, (_, i) => finding('CRITICAL', `c${i}`));
    expect(scoreFromFindings(many)).toBe(0);
  });
});

describe('reduceReviews', () => {
  it('returns a single partial unchanged', () => {
    const only = review({ verdict: 'comment', score: 70, summary: 'x' });
    expect(reduceReviews([only])).toBe(only);
  });

  it('concats findings, keeps the worst verdict, averages score, joins summaries', () => {
    const merged = reduceReviews([
      review({ verdict: 'comment', score: 80, summary: 'a', findings: [finding('WARNING', 'w')] }),
      review({ verdict: 'request_changes', score: 41, summary: '', findings: [finding('CRITICAL', 'c')] }),
      review({ verdict: 'approve', score: 100, summary: 'c' }),
    ]);
    expect(merged.verdict).toBe('request_changes');
    expect(merged.score).toBe(74); // round((80 + 41 + 100) / 3)
    expect(merged.summary).toBe('a c');
    expect(merged.findings.map((f) => f.id)).toEqual(['w', 'c']);
  });
});

describe('sliceDiff', () => {
  const raw = [
    'diff --git a/src/a.ts b/src/a.ts',
    '+const a = 1;',
    'diff --git a/src/b.ts b/src/b.ts',
    '+const b = 2;',
  ].join('\n');
  const diff: UnifiedDiff = {
    raw,
    files: [
      { path: 'src/a.ts', additions: 1, deletions: 0, hunks: [] },
      { path: 'src/b.ts', additions: 1, deletions: 0, hunks: [] },
      { path: 'src/c.ts', additions: 1, deletions: 0, hunks: [] },
    ],
  };

  it('returns only the requested file section', () => {
    expect(sliceDiff(diff, 'src/b.ts')).toBe('diff --git a/src/b.ts b/src/b.ts\n+const b = 2;');
  });

  it('synthesizes a header for a file missing from the raw diff', () => {
    expect(sliceDiff(diff, 'src/c.ts')).toBe('diff --git a/src/c.ts b/src/c.ts\n--- a/src/c.ts\n+++ b/src/c.ts');
  });

  it('falls back to the whole raw diff for an unknown file', () => {
    expect(sliceDiff(diff, 'nope.ts')).toBe(raw);
  });
});
