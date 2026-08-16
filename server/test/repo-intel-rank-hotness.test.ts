/**
 * specs/10-onboarding-generator.md (D6/D7) — `computeFileRank`'s new, optional
 * `churn` parameter. `repo-intel-rank-map.test.ts` still pins the original
 * "Option B" no-churn behaviour (hotness always 0); this file covers what
 * changed: real hotness normalization, the AC-10 un-indexed-path exclusion,
 * and D7's "rank stays = pagerank, never redefined via hotness" invariant.
 */
import { describe, it, expect } from 'vitest';
import { computeFileRank } from '../src/modules/repo-intel/pipeline/rank.js';

describe('computeFileRank — hotness from churn (D6)', () => {
  it('normalizes hotness = count / max(count) over the files being ranked; the top-churned file gets hotness=1', () => {
    const files = ['a.ts', 'b.ts', 'c.ts'];
    const churn = new Map([
      ['a.ts', 2],
      ['b.ts', 8],
      ['c.ts', 4],
    ]);
    const rows = computeFileRank(files, [], churn);
    const byPath = new Map(rows.map((r) => [r.filePath, r]));
    expect(byPath.get('b.ts')!.hotness).toBeCloseTo(1, 10);
    expect(byPath.get('c.ts')!.hotness).toBeCloseTo(0.5, 10);
    expect(byPath.get('a.ts')!.hotness).toBeCloseTo(0.25, 10);
  });

  it('a churned path absent from `files` is ignored entirely — never introduced as a node, never inflates the normalization max (AC-10)', () => {
    const files = ['a.ts', 'b.ts'];
    // 'unindexed.ts' has by far the highest raw count but is NOT in `files`.
    const churn = new Map([
      ['a.ts', 1],
      ['b.ts', 2],
      ['unindexed.ts', 1000],
    ]);
    const rows = computeFileRank(files, [], churn);
    expect(rows).toHaveLength(2); // no third node introduced
    const byPath = new Map(rows.map((r) => [r.filePath, r]));
    // max is computed over {a.ts: 1, b.ts: 2} only — b gets hotness=1, not 2/1000.
    expect(byPath.get('b.ts')!.hotness).toBeCloseTo(1, 10);
    expect(byPath.get('a.ts')!.hotness).toBeCloseTo(0.5, 10);
  });

  it('a file with no entry in `churn` at all gets hotness=0, not undefined/NaN', () => {
    const files = ['a.ts', 'b.ts'];
    const churn = new Map([['a.ts', 5]]); // b.ts absent
    const rows = computeFileRank(files, [], churn);
    const byPath = new Map(rows.map((r) => [r.filePath, r]));
    expect(byPath.get('b.ts')!.hotness).toBe(0);
  });

  it('omitting the churn arg entirely -> hotness=0 for every file, identical to the pre-D6 pure-PageRank behavior', () => {
    const rows = computeFileRank(['a.ts', 'b.ts'], []);
    for (const r of rows) expect(r.hotness).toBe(0);
  });

  it('an explicit-but-empty churn map, or one whose max is 0, degrades to hotness=0 for everyone — never NaN/Infinity (the hotness=0 boundary the reviewer flagged as undocumented)', () => {
    const rows = computeFileRank(['a.ts', 'b.ts'], [], new Map());
    for (const r of rows) {
      expect(r.hotness).toBe(0);
      expect(Number.isFinite(r.hotness)).toBe(true);
    }
    const zeroChurn = computeFileRank(['a.ts', 'b.ts'], [], new Map([['a.ts', 0], ['b.ts', 0]]));
    for (const r of zeroChurn) expect(r.hotness).toBe(0);
  });

  it('`rank` stays = pagerank always, never redefined using hotness (D7) — even when hotness and pagerank strongly disagree', () => {
    const files = ['a.ts', 'b.ts', 'c.ts'];
    const edges = [
      { fromFile: 'a.ts', toFile: 'c.ts' },
      { fromFile: 'b.ts', toFile: 'c.ts' },
    ];
    // a.ts is the hottest file by far but is NOT the most depended-upon.
    const churn = new Map([
      ['a.ts', 100],
      ['c.ts', 1],
    ]);
    const rows = computeFileRank(files, edges, churn);
    for (const r of rows) expect(r.rank).toBe(r.pagerank);
    const byPath = new Map(rows.map((r) => [r.filePath, r]));
    // c.ts is still the most-depended-on file -> still ranks highest, despite
    // having the lowest hotness of the three.
    expect(byPath.get('c.ts')!.rank).toBeGreaterThan(byPath.get('a.ts')!.rank);
    expect(byPath.get('a.ts')!.hotness).toBeGreaterThan(byPath.get('c.ts')!.hotness);
  });

  it('percentile is still derived from `rank` (=pagerank), unaffected by hotness — no regression from adding churn', () => {
    const files = ['a.ts', 'b.ts', 'c.ts'];
    const edges = [
      { fromFile: 'a.ts', toFile: 'b.ts' },
      { fromFile: 'a.ts', toFile: 'c.ts' },
      { fromFile: 'b.ts', toFile: 'c.ts' },
    ];
    const withChurn = computeFileRank(files, edges, new Map([['a.ts', 50]]));
    const withoutChurn = computeFileRank(files, edges);
    const pctWith = new Map(withChurn.map((r) => [r.filePath, r.percentile]));
    const pctWithout = new Map(withoutChurn.map((r) => [r.filePath, r.percentile]));
    for (const f of files) expect(pctWith.get(f)).toBe(pctWithout.get(f));
  });
});
