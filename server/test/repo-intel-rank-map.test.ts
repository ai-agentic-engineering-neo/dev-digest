/**
 * T3 — pure-logic unit tests for the rank + repo-map pipeline steps and the
 * tokenizer fallback. No DB, no clone, no Docker: these pin the algorithms
 * (PageRank direction, percentile ties, token-budget binary search, dedup).
 */
import { describe, it, expect } from 'vitest';
import { computeFileRank } from '../src/modules/repo-intel/pipeline/rank.js';
import { renderRepoMap, REPO_MAP_HEADER } from '../src/modules/repo-intel/pipeline/repo-map.js';
import { approxTokens, TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import type { Tokenizer } from '../src/adapters/tokenizer/index.js';
import type { RepoMapCandidateRow } from '../src/modules/repo-intel/repository.js';

/** Deterministic char-count tokenizer so budgets are exact in tests. */
const charTokenizer: Tokenizer = { count: (t) => t.length };

describe('computeFileRank (Option B: rank = pagerank, hotness = 0)', () => {
  it('returns [] for no files', () => {
    expect(computeFileRank([], [])).toEqual([]);
  });

  it('ranks depended-upon files highest (importer → imported edges)', () => {
    // a → b, a → c, b → c  ⇒  c is imported most ⇒ highest rank/percentile.
    const files = ['a.ts', 'b.ts', 'c.ts'];
    const edges = [
      { fromFile: 'a.ts', toFile: 'b.ts' },
      { fromFile: 'a.ts', toFile: 'c.ts' },
      { fromFile: 'b.ts', toFile: 'c.ts' },
    ];
    const rows = computeFileRank(files, edges);
    const byPath = new Map(rows.map((r) => [r.filePath, r]));

    // hotness is always 0; rank mirrors pagerank.
    for (const r of rows) {
      expect(r.hotness).toBe(0);
      expect(r.rank).toBe(r.pagerank);
    }
    // c is the most-depended-on → strictly highest rank.
    expect(byPath.get('c.ts')!.rank).toBeGreaterThan(byPath.get('b.ts')!.rank);
    expect(byPath.get('b.ts')!.rank).toBeGreaterThan(byPath.get('a.ts')!.rank);
    // percentile: top file → 100, dense from the bottom (1..100).
    expect(byPath.get('c.ts')!.percentile).toBe(100);
    expect(byPath.get('b.ts')!.percentile).toBe(67);
    expect(byPath.get('a.ts')!.percentile).toBe(33);
  });

  it('gives tied (isolated) files the same percentile', () => {
    const rows = computeFileRank(['x.ts', 'y.ts'], []);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.rank).toBeCloseTo(rows[1]!.rank, 10);
    // Tie group of all files → both share the top percentile.
    expect(rows[0]!.percentile).toBe(100);
    expect(rows[1]!.percentile).toBe(100);
  });
});

describe('renderRepoMap', () => {
  const candidates: RepoMapCandidateRow[] = [
    { path: 'a.ts', name: 'foo', exported: true, signature: 'function foo()', rank: 5 },
    { path: 'a.ts', name: 'bar', exported: true, signature: 'function bar()', rank: 5 },
    { path: 'b.ts', name: 'baz', exported: false, signature: 'function baz()', rank: 1 },
  ];

  it('returns just the header for no candidates', () => {
    const { text, tokens } = renderRepoMap([], charTokenizer, 1000);
    expect(text).toBe(`${REPO_MAP_HEADER}\n`);
    expect(tokens).toBe(text.length);
  });

  it('renders header + per-file grouped signatures within a generous budget', () => {
    const { text, tokens } = renderRepoMap(candidates, charTokenizer, 100_000);
    expect(text.startsWith(REPO_MAP_HEADER)).toBe(true);
    expect(text).toContain('a.ts:');
    expect(text).toContain('  function foo()');
    expect(text).toContain('  function bar()');
    expect(text).toContain('b.ts:');
    expect(text).toContain('  function baz()');
    expect(tokens).toBe(text.length);
    expect(tokens).toBeLessThanOrEqual(100_000);
  });

  it('never exceeds the budget (drops lowest-ranked candidates first)', () => {
    // Budget that fits the header + a.ts block but not b.ts.
    const full = renderRepoMap(candidates, charTokenizer, 100_000).text;
    const aOnlyBudget = full.indexOf('b.ts:'); // chars up to (not incl.) b.ts
    const { text, tokens } = renderRepoMap(candidates, charTokenizer, aOnlyBudget);
    expect(tokens).toBeLessThanOrEqual(aOnlyBudget);
    expect(text).toContain('a.ts:');
    expect(text).not.toContain('b.ts:');
  });

  it('dedupes dual-emit rows (same path + signature) and skips null signatures', () => {
    const dual: RepoMapCandidateRow[] = [
      { path: 'c.ts', name: 'Svc.run', exported: true, signature: 'run()', rank: 9 },
      { path: 'c.ts', name: 'run', exported: true, signature: 'run()', rank: 9 },
      { path: 'c.ts', name: 'nosig', exported: true, signature: null, rank: 9 },
    ];
    const { text } = renderRepoMap(dual, charTokenizer, 100_000);
    // 'run()' appears exactly once despite the dual emit.
    expect(text.match(/run\(\)/g)?.length).toBe(1);
  });
});

describe('tokenizer', () => {
  it('approxTokens is ceil(chars / 4)', () => {
    expect(approxTokens('')).toBe(0);
    expect(approxTokens('abcd')).toBe(1);
    expect(approxTokens('abcde')).toBe(2);
  });

  it('TiktokenTokenizer returns a positive count for non-empty text', () => {
    const tok = new TiktokenTokenizer();
    expect(tok.count('hello world')).toBeGreaterThan(0);
    expect(tok.count('')).toBe(0);
  });
});
