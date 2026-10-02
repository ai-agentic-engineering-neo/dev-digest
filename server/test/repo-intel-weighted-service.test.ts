/**
 * specs/11-why-risk-brief.md / specs/10-onboarding-generator.md (D7) — hermetic
 * (no DB) coverage for `RepoIntelService.getWeightedRankedFiles` and the
 * `order: 'weighted'` branch of `getCriticalPaths`. Same pattern as
 * `repo-intel-facade-degraded.test.ts`: patch the private `repo` field with an
 * in-memory stub matching `RepoIntelRepository`'s surface.
 */
import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { FileRankFullRow, IndexerEdgeRow } from '../src/modules/repo-intel/repository.js';
import type { Container } from '../src/platform/container.js';

function buildService(opts: {
  fileRankRows?: FileRankFullRow[];
  edges?: IndexerEdgeRow[];
  rankedPaths?: Array<{ path: string; rank: number }>;
  repoIntelEnabled?: boolean;
}): RepoIntelService {
  const container = {
    config: { repoIntelEnabled: opts.repoIntelEnabled ?? true },
    db: {} as never,
  } as unknown as Container;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getFileRankRows: async () => opts.fileRankRows ?? [],
    getEdges: async () => opts.edges ?? [],
    getRankedPaths: async () => opts.rankedPaths ?? [],
  };
  return svc;
}

describe('RepoIntelService.getWeightedRankedFiles', () => {
  it('sorts desc by pagerank * (1 + hotness) and drops junk paths (tests/configs)', async () => {
    const rows: FileRankFullRow[] = [
      { path: 'src/core.ts', pagerank: 0.5, hotness: 0.2, percentile: 90 }, // weighted 0.6
      { path: 'src/hot.ts', pagerank: 0.1, hotness: 0.9, percentile: 60 }, // weighted 0.19
      { path: 'src/core.test.ts', pagerank: 0.9, hotness: 0.9, percentile: 99 }, // junk — would win on raw score
    ];
    const svc = buildService({ fileRankRows: rows });
    const out = await svc.getWeightedRankedFiles('r1', 10);
    expect(out.map((r) => r.path)).toEqual(['src/core.ts', 'src/hot.ts']);
    expect(out[0]!.weighted).toBeCloseTo(0.6, 10);
  });

  it('n<=0 -> []', async () => {
    const svc = buildService({
      fileRankRows: [{ path: 'a.ts', pagerank: 1, hotness: 0, percentile: 100 }],
    });
    await expect(svc.getWeightedRankedFiles('r1', 0)).resolves.toEqual([]);
    await expect(svc.getWeightedRankedFiles('r1', -1)).resolves.toEqual([]);
  });

  it('repoIntelEnabled=false -> [] (degraded-array contract)', async () => {
    const svc = buildService({
      repoIntelEnabled: false,
      fileRankRows: [{ path: 'a.ts', pagerank: 1, hotness: 1, percentile: 100 }],
    });
    await expect(svc.getWeightedRankedFiles('r1', 10)).resolves.toEqual([]);
  });

  it('honors caller-supplied exclude substrings, same as getTopFilesByRank', async () => {
    const rows: FileRankFullRow[] = [
      { path: 'src/legacy/old.ts', pagerank: 0.9, hotness: 0, percentile: 90 },
      { path: 'src/new.ts', pagerank: 0.1, hotness: 0, percentile: 50 },
    ];
    const svc = buildService({ fileRankRows: rows });
    const out = await svc.getWeightedRankedFiles('r1', 10, { exclude: ['legacy'] });
    expect(out.map((r) => r.path)).toEqual(['src/new.ts']);
  });

  it('caps at n even when more non-junk rows are available', async () => {
    const rows: FileRankFullRow[] = Array.from({ length: 5 }, (_, i) => ({
      path: `src/f${i}.ts`,
      pagerank: 1 - i * 0.1,
      hotness: 0,
      percentile: 100 - i,
    }));
    const svc = buildService({ fileRankRows: rows });
    const out = await svc.getWeightedRankedFiles('r1', 2);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.path)).toEqual(['src/f0.ts', 'src/f1.ts']);
  });

  // Regression for a 2026-08-14 test-quality WARNING (80% confidence):
  // `isJunkPath` used to bare-substring-match a tool name anywhere in the
  // full path, so real source files that merely mention a build tool's name
  // — not an actual test/config/declaration file — were misclassified as
  // junk and silently dropped. Fixed to match a directory-segment or
  // basename pattern instead of an unanchored substring.
  it('does NOT drop real source files that merely mention a tool name in a directory or file name', async () => {
    const rows: FileRankFullRow[] = [
      { path: 'src/eslint-plugin-custom/index.ts', pagerank: 0.8, hotness: 0, percentile: 90 },
      { path: 'packages/prettier-plugin-organize-imports/src/index.ts', pagerank: 0.7, hotness: 0, percentile: 85 },
      { path: 'src/jest.utils.ts', pagerank: 0.6, hotness: 0, percentile: 80 },
    ];
    const svc = buildService({ fileRankRows: rows });
    const out = await svc.getWeightedRankedFiles('r1', 10);
    expect(out.map((r) => r.path)).toEqual([
      'src/eslint-plugin-custom/index.ts',
      'packages/prettier-plugin-organize-imports/src/index.ts',
      'src/jest.utils.ts',
    ]);
  });

  it('still drops genuine tool config files by basename', async () => {
    const rows: FileRankFullRow[] = [
      { path: 'webpack.config.js', pagerank: 0.9, hotness: 0, percentile: 99 },
      { path: '.eslintrc.js', pagerank: 0.9, hotness: 0, percentile: 99 },
      { path: 'jest.config.ts', pagerank: 0.9, hotness: 0, percentile: 99 },
      { path: 'src/real.ts', pagerank: 0.1, hotness: 0, percentile: 50 },
    ];
    const svc = buildService({ fileRankRows: rows });
    const out = await svc.getWeightedRankedFiles('r1', 10);
    expect(out.map((r) => r.path)).toEqual(['src/real.ts']);
  });
});

describe('RepoIntelService.getCriticalPaths — junk-root reproduction (70% WARNING)', () => {
  it('order: "weighted" DOES seed a chain from a junk-path root when it out-scores legitimate roots — REPRODUCES the reviewer finding. By design per the method\'s own doc comment ("Unfiltered — no junk-path drop... mirrors its rank order sibling"), not a regression unique to D7.', async () => {
    const rows: FileRankFullRow[] = [
      { path: 'src/foo.test.ts', pagerank: 0.9, hotness: 0.9, percentile: 99 }, // junk, weighted 1.71 — highest
      { path: 'src/core.ts', pagerank: 0.5, hotness: 0.1, percentile: 90 }, // weighted 0.55
      { path: 'src/api.ts', pagerank: 0.4, hotness: 0.1, percentile: 80 }, // weighted 0.44
    ];
    const edges: IndexerEdgeRow[] = [
      { fromFile: 'src/foo.test.ts', toFile: 'src/helper.ts' },
      { fromFile: 'src/core.ts', toFile: 'src/api.ts' },
    ];
    const svc = buildService({ fileRankRows: rows, edges });
    const chains = await svc.getCriticalPaths('r1', { order: 'weighted', roots: 3 });
    const roots = chains.map((c) => c[0]);
    expect(roots).toContain('src/foo.test.ts'); // junk path WAS used to seed a chain
  });

  it('order: "rank" (default) has the SAME unfiltered-roots behavior — pre-existing, not introduced by D7', async () => {
    const rankedPaths = [
      { path: 'src/bar.spec.ts', rank: 0.99 }, // junk, top-ranked
      { path: 'src/core.ts', rank: 0.5 },
    ];
    const edges: IndexerEdgeRow[] = [{ fromFile: 'src/bar.spec.ts', toFile: 'src/helper.ts' }];
    const svc = buildService({ rankedPaths, edges });
    const chains = await svc.getCriticalPaths('r1'); // default order='rank'
    const roots = chains.map((c) => c[0]);
    expect(roots).toContain('src/bar.spec.ts');
  });

  it('contrast: getWeightedRankedFiles (the file LIST consumers actually read) DOES filter the identical junk path — the gap is specific to getCriticalPaths\' root selection', async () => {
    const rows: FileRankFullRow[] = [
      { path: 'src/foo.test.ts', pagerank: 0.9, hotness: 0.9, percentile: 99 },
      { path: 'src/core.ts', pagerank: 0.5, hotness: 0.1, percentile: 90 },
    ];
    const svc = buildService({ fileRankRows: rows });
    const out = await svc.getWeightedRankedFiles('r1', 10);
    expect(out.map((r) => r.path)).not.toContain('src/foo.test.ts');
  });

  it('no edges -> [] without querying rank at all (both orderings)', async () => {
    const svc = buildService({ edges: [] });
    await expect(svc.getCriticalPaths('r1')).resolves.toEqual([]);
    await expect(svc.getCriticalPaths('r1', { order: 'weighted' })).resolves.toEqual([]);
  });

  it('repoIntelEnabled=false -> [] regardless of ordering', async () => {
    const svc = buildService({
      repoIntelEnabled: false,
      edges: [{ fromFile: 'a.ts', toFile: 'b.ts' }],
    });
    await expect(svc.getCriticalPaths('r1', { order: 'weighted' })).resolves.toEqual([]);
  });
});
