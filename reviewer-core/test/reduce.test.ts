import { describe, it, expect } from 'vitest';
import type { Finding, Review, UnifiedDiff } from '@devdigest/shared';
import { reduceReviews, scoreFromFindings, sliceDiff } from '../src/review/reduce.js';

/**
 * Spec for src/review/reduce.ts — the map-reduce helpers.
 *
 * Rules pinned here:
 * - scoreFromFindings: 100 minus a per-severity penalty (CRITICAL 35, WARNING 12,
 *   SUGGESTION 3), clamped to [0, 100]. The model's own score is not an input.
 * - reduceReviews: concatenates findings in partial order with NO dedupe, takes the
 *   worst verdict (request_changes > comment > approve), rounds the MEAN score, and
 *   joins non-empty summaries with a space. A single partial is returned as-is.
 * - sliceDiff: returns the `diff --git` sections whose header mentions the path;
 *   falls back to a header-only stub, or to the whole raw diff for unknown files.
 */

let seq = 0;
function finding(over: Partial<Finding> = {}): Finding {
  seq += 1;
  return {
    id: `f-${seq}`,
    severity: 'WARNING',
    category: 'bug',
    title: 'title',
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'because',
    confidence: 0.9,
    ...over,
  } as Finding;
}

function review(over: Partial<Review> = {}): Review {
  return { verdict: 'approve', score: 100, summary: '', findings: [], ...over } as Review;
}

const sev = (...s: Finding['severity'][]): Finding[] => s.map((severity) => finding({ severity }));

describe('scoreFromFindings — deterministic score from grounded findings', () => {
  it.each<[string, Finding[], number]>([
    ['no findings → perfect 100', [], 100],
    ['one SUGGESTION costs 3', sev('SUGGESTION'), 97],
    ['one WARNING costs 12', sev('WARNING'), 88],
    ['one CRITICAL costs 35', sev('CRITICAL'), 65],
    ['penalties add up across severities', sev('CRITICAL', 'WARNING', 'SUGGESTION'), 50],
    ['duplicate findings are each penalised', sev('WARNING', 'WARNING'), 76],
    ['exactly 100 penalty → 0', [...sev('CRITICAL', 'CRITICAL', 'WARNING'), ...sev('SUGGESTION', 'SUGGESTION', 'SUGGESTION', 'SUGGESTION', 'SUGGESTION', 'SUGGESTION')], 0],
    ['penalty beyond 100 is clamped at 0', sev('CRITICAL', 'CRITICAL', 'CRITICAL'), 0],
    ['unknown severity costs nothing', [finding({ severity: 'INFO' as Finding['severity'] })], 100],
  ])('%s', (_name, findings, expected) => {
    expect(scoreFromFindings(findings)).toBe(expected);
  });
});

describe('reduceReviews — verdict: worst one wins', () => {
  it.each<[string, Review['verdict'][], Review['verdict']]>([
    ['all approve → approve', ['approve', 'approve'], 'approve'],
    ['approve + comment → comment', ['approve', 'comment'], 'comment'],
    ['comment + approve (order irrelevant) → comment', ['comment', 'approve'], 'comment'],
    ['any request_changes → request_changes', ['approve', 'request_changes', 'comment'], 'request_changes'],
    ['request_changes first still wins', ['request_changes', 'approve'], 'request_changes'],
    ['tie of comments → comment', ['comment', 'comment'], 'comment'],
    ['unknown verdict ranks like approve and never wins', ['bogus' as Review['verdict'], 'approve'], 'approve'],
  ])('%s', (_name, verdicts, expected) => {
    expect(reduceReviews(verdicts.map((verdict) => review({ verdict }))).verdict).toBe(expected);
  });
});

describe('reduceReviews — score: rounded mean of partial scores', () => {
  it.each<[string, number[], number]>([
    ['equal scores → same score', [80, 80], 80],
    ['mean of two', [100, 60], 80],
    ['mean of three', [90, 60, 30], 60],
    ['x.5 rounds up (Math.round)', [100, 99], 100],
    ['below .5 rounds down', [100, 100, 99], 100],
    ['0.33 fraction rounds down', [0, 0, 1], 0],
    ['0.67 fraction rounds up', [0, 1, 1], 1],
  ])('%s', (_name, scores, expected) => {
    expect(reduceReviews(scores.map((score) => review({ score }))).score).toBe(expected);
  });
});

describe('reduceReviews — summary: non-empty summaries joined by a space', () => {
  it.each<[string, string[], string]>([
    ['joins in partial order', ['A.', 'B.'], 'A. B.'],
    ['skips empty summaries', ['A.', '', 'C.'], 'A. C.'],
    ['all empty → empty string', ['', ''], ''],
  ])('%s', (_name, summaries, expected) => {
    expect(reduceReviews(summaries.map((summary) => review({ summary }))).summary).toBe(expected);
  });
});

describe('reduceReviews — findings: plain concatenation', () => {
  it('concatenates findings in partial order', () => {
    const a = finding({ file: 'a.ts' });
    const b = finding({ file: 'b.ts' });
    const c = finding({ file: 'c.ts' });
    const out = reduceReviews([review({ findings: [a, b] }), review({ findings: [] }), review({ findings: [c] })]);
    expect(out.findings).toEqual([a, b, c]);
  });

  it.each<[string, Partial<Finding>]>([
    ['identical id', {}],
    ['same file + lines + title', { id: 'other-id' }],
  ])('does NOT dedupe findings with %s across partials', (_name, overB) => {
    const a = finding({ id: 'dup', file: 'x.ts', start_line: 3, end_line: 3, title: 't' });
    const b = { ...a, ...overB };
    const out = reduceReviews([review({ findings: [a] }), review({ findings: [b] })]);
    expect(out.findings).toHaveLength(2);
  });

  it('does not sort by severity — order follows the partials', () => {
    const s = finding({ severity: 'SUGGESTION' });
    const c = finding({ severity: 'CRITICAL' });
    const out = reduceReviews([review({ findings: [s] }), review({ findings: [c] })]);
    expect(out.findings.map((f) => f.severity)).toEqual(['SUGGESTION', 'CRITICAL']);
  });
});

describe('reduceReviews — edge cases', () => {
  it('single partial is returned by identity (no recomputation)', () => {
    const only = review({ verdict: 'comment', score: 42, summary: 'x', findings: [finding()] });
    expect(reduceReviews([only])).toBe(only);
  });

  it('empty input → approve, score 0, empty summary, no findings', () => {
    // NOTE: score 0 for "nothing reviewed" contradicts scoreFromFindings([]) === 100;
    // run.ts recomputes the score from findings afterwards, so this is not user-visible.
    expect(reduceReviews([])).toEqual({ verdict: 'approve', score: 0, summary: '', findings: [] });
  });

  it('output carries only verdict/score/summary/findings', () => {
    const out = reduceReviews([review(), review()]);
    expect(Object.keys(out).sort()).toEqual(['findings', 'score', 'summary', 'verdict']);
  });
});

describe('sliceDiff — per-file slice of the raw diff', () => {
  const raw = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,1 +1,2 @@',
    ' keep',
    '+added a',
    'diff --git a/src/b.ts b/src/b.ts',
    '--- a/src/b.ts',
    '+++ b/src/b.ts',
    '@@ -1,1 +1,1 @@',
    '-old b',
    '+new b',
  ].join('\n');
  const diff: UnifiedDiff = {
    raw,
    files: [
      { path: 'src/a.ts', additions: 1, deletions: 0, hunks: [] },
      { path: 'src/b.ts', additions: 1, deletions: 1, hunks: [] },
      { path: 'src/only-parsed.ts', additions: 0, deletions: 0, hunks: [] },
    ],
  };

  it.each<[string, string, string]>([
    ['first file → its section only', 'src/a.ts', raw.split('\n').slice(0, 6).join('\n')],
    ['last file → its section only', 'src/b.ts', raw.split('\n').slice(6).join('\n')],
    [
      'file parsed but absent from raw → header-only stub',
      'src/only-parsed.ts',
      'diff --git a/src/only-parsed.ts b/src/only-parsed.ts\n--- a/src/only-parsed.ts\n+++ b/src/only-parsed.ts',
    ],
    ['unknown file → whole raw diff', 'src/nope.ts', raw],
  ])('%s', (_name, path, expected) => {
    expect(sliceDiff(diff, path)).toBe(expected);
  });

  // Headers are matched exactly (`a/<old> b/<new>`), never as a substring.
  const rawX = [
    'diff --git a/src/a.ts b/src/a.ts',
    '+a',
    'diff --git a/src/a.tsx b/src/a.tsx',
    '+tsx',
    'diff --git a/lib/src/a.ts b/lib/src/a.ts',
    '+nested',
    'diff --git a/old/name.ts b/new/name.ts',
    '+renamed',
    'diff --git a/z.ts b/z.ts',
    '+ mentions b/src/a.ts in the body only',
  ].join('\n');
  const dX: UnifiedDiff = { raw: rawX, files: [] };

  it.each<[string, string, string]>([
    ['a path does not capture a longer path it prefixes (a.ts vs a.tsx)', 'src/a.ts', 'diff --git a/src/a.ts b/src/a.ts\n+a'],
    ['the longer path gets only its own section', 'src/a.tsx', 'diff --git a/src/a.tsx b/src/a.tsx\n+tsx'],
    ['a path does not capture another path it is a suffix of', 'a.ts', rawX],
    ['a nested path matches its own header only', 'lib/src/a.ts', 'diff --git a/lib/src/a.ts b/lib/src/a.ts\n+nested'],
    ['a rename matches by its new path', 'new/name.ts', 'diff --git a/old/name.ts b/new/name.ts\n+renamed'],
    ['a rename matches by its old path', 'old/name.ts', 'diff --git a/old/name.ts b/new/name.ts\n+renamed'],
  ])('%s', (_name, path, expected) => {
    expect(sliceDiff(dX, path)).toBe(expected);
  });
});
