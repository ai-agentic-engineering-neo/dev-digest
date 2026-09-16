import { describe, it, expect } from 'vitest';
import { taskLine, summarizeFindings, latestRoundRunIds, ROUND_WINDOW_MS } from '../src/modules/reviews/helpers.js';
import type { FindingRow } from '../src/db/rows.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

/**
 * summarizeFindings groups already-loaded findings by severity — a plain
 * COUNT/filter, no LLM call — for the PR-list column and timeline popover.
 */
describe('summarizeFindings', () => {
  function finding(o: Partial<FindingRow>): FindingRow {
    return {
      id: 'f1',
      reviewId: 'r1',
      file: 'src/a.ts',
      startLine: 1,
      endLine: 1,
      severity: 'WARNING',
      category: 'bug',
      title: 'Some finding',
      rationale: 'Because reasons.',
      suggestion: null,
      confidence: 0.8,
      kind: 'finding',
      trifectaComponents: null,
      acceptedAt: null,
      dismissedAt: null,
      ...o,
    } as FindingRow;
  }

  it('counts each severity independently', () => {
    const { counts } = summarizeFindings([
      finding({ id: 'a', severity: 'CRITICAL' }),
      finding({ id: 'b', severity: 'CRITICAL' }),
      finding({ id: 'c', severity: 'WARNING' }),
      finding({ id: 'd', severity: 'SUGGESTION' }),
    ]);
    expect(counts).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it('excludes dismissed findings from counts and items', () => {
    const { counts, items } = summarizeFindings([
      finding({ id: 'a', severity: 'CRITICAL' }),
      finding({ id: 'b', severity: 'CRITICAL', dismissedAt: new Date() }),
    ]);
    expect(counts.CRITICAL).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('a');
  });

  it('returns zero counts and no items for an empty review', () => {
    expect(summarizeFindings([])).toEqual({
      counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      items: [],
    });
  });

  it('sorts items CRITICAL → WARNING → SUGGESTION, then by confidence desc', () => {
    const { items } = summarizeFindings([
      finding({ id: 'a', severity: 'SUGGESTION', confidence: 0.9 }),
      finding({ id: 'b', severity: 'CRITICAL', confidence: 0.6 }),
      finding({ id: 'c', severity: 'CRITICAL', confidence: 0.95 }),
      finding({ id: 'd', severity: 'WARNING', confidence: 0.7 }),
    ]);
    expect(items.map((i) => i.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('every count equals the number of items of that severity (invariant)', () => {
    const { counts, items } = summarizeFindings([
      finding({ id: 'a', severity: 'CRITICAL' }),
      finding({ id: 'b', severity: 'WARNING' }),
      finding({ id: 'c', severity: 'WARNING' }),
      finding({ id: 'd', severity: 'SUGGESTION', dismissedAt: new Date() }),
    ]);
    for (const sev of ['CRITICAL', 'WARNING', 'SUGGESTION'] as const) {
      expect(counts[sev]).toBe(items.filter((i) => i.severity === sev).length);
    }
  });

  it('truncates a long rationale for the preview', () => {
    const long = 'x'.repeat(400);
    const { items } = summarizeFindings([finding({ rationale: long })]);
    expect(items[0].rationale.length).toBeLessThan(400);
    expect(items[0].rationale.endsWith('…')).toBe(true);
  });
});

/**
 * latestRoundRunIds groups a PR's agent_runs into the most recent "round"
 * (e.g. every agent triggered by one "Review all" click) by clustering on
 * `ranAt` (set once, at creation — before any agent's slow LLM call starts),
 * not on when each review later finishes.
 */
describe('latestRoundRunIds', () => {
  const BASE = Date.parse('2026-09-16T13:05:37.000Z');
  function run(id: string, offsetMs: number) {
    return { id, ranAt: new Date(BASE + offsetMs) };
  }

  it('returns an empty set for no runs', () => {
    expect(latestRoundRunIds([])).toEqual(new Set());
  });

  it('groups runs created back-to-back (a "Review all" click) into one round', () => {
    const ids = latestRoundRunIds([run('a', 0), run('b', 12), run('c', 22)]);
    expect(ids).toEqual(new Set(['a', 'b', 'c']));
  });

  it('excludes an older, separate round outside the window', () => {
    const ids = latestRoundRunIds([
      run('old', -12 * 60 * 1000), // 12 minutes earlier — a different click
      run('a', 0),
      run('b', 15),
    ]);
    expect(ids).toEqual(new Set(['a', 'b']));
    expect(ids.has('old')).toBe(false);
  });

  it('is anchored to the LATEST run, not run order in the array', () => {
    // Out-of-order input: the newest run appears first.
    const ids = latestRoundRunIds([run('newest', 0), run('old', -ROUND_WINDOW_MS * 5)]);
    expect(ids).toEqual(new Set(['newest']));
  });

  it('includes a run exactly at the window boundary, excludes one just past it', () => {
    const ids = latestRoundRunIds([
      run('latest', 0),
      run('at-boundary', -ROUND_WINDOW_MS),
      run('past-boundary', -ROUND_WINDOW_MS - 1),
    ]);
    expect(ids.has('latest')).toBe(true);
    expect(ids.has('at-boundary')).toBe(true);
    expect(ids.has('past-boundary')).toBe(false);
  });
});
