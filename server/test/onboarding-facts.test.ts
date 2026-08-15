import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleFacts } from '../src/modules/onboarding/facts.js';
import type { RepoIntelIndexState, RepoIntelPort, RepoIntelWeightedFile } from '../src/modules/onboarding/ports.js';
import {
  CRITICAL_PATHS_MAX,
  FACT_ALL_PATHS_POOL,
  FACT_RANKED_FILES,
  READING_PATH_MAX,
} from '../src/modules/onboarding/constants.js';

/**
 * specs/10-onboarding-generator.md — AC-1, AC-3, AC-5, AC-18. `assembleFacts`
 * never touches an LLM (no such dependency exists in its signature at all —
 * AC-1 holds by construction) and never walks the filesystem for structure
 * (AC-3) — the directory skeleton comes ONLY from the indexed paths the fake
 * `RepoIntelPort` returns, verified below against extra files the fixture
 * checkout has that are deliberately NOT in that index.
 */

class FakeRepoIntel implements RepoIntelPort {
  calls: Record<string, unknown[][]> = {};

  constructor(
    private data: {
      state: RepoIntelIndexState;
      weighted: RepoIntelWeightedFile[];
      chains: string[][];
      facts?: Record<string, { endpoints: string[]; crons: string[] }>;
    },
  ) {}

  async getIndexState(repoId: string): Promise<RepoIntelIndexState> {
    this.record('getIndexState', [repoId]);
    return this.data.state;
  }

  async getWeightedRankedFiles(
    repoId: string,
    n: number,
    opts?: { exclude?: string[] },
  ): Promise<RepoIntelWeightedFile[]> {
    this.record('getWeightedRankedFiles', [repoId, n, opts]);
    return this.data.weighted.slice(0, n);
  }

  async getCriticalPaths(
    repoId: string,
    opts?: { order?: 'rank' | 'weighted'; roots?: number },
  ): Promise<string[][]> {
    this.record('getCriticalPaths', [repoId, opts]);
    return this.data.chains;
  }

  async getFileFacts(
    repoId: string,
    paths: string[],
  ): Promise<Array<{ file: string; endpoints: string[]; crons: string[] }>> {
    this.record('getFileFacts', [repoId, paths]);
    const facts = this.data.facts ?? {};
    return paths.filter((p) => facts[p]).map((p) => ({ file: p, ...facts[p]! }));
  }

  private record(name: string, args: unknown[]): void {
    (this.calls[name] ??= []).push(args);
  }
}

function weightedRow(path: string, weighted: number): RepoIntelWeightedFile {
  return { path, pagerank: weighted, hotness: 0, weighted, percentile: 50 };
}

const STATE: RepoIntelIndexState = {
  status: 'full',
  lastIndexedSha: 'sha-abc',
  indexerVersion: 2,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  filesIndexed: 120,
  filesSkipped: 0,
  filesExcludedByBound: 5,
  hotnessPrs: 12,
  hotnessWindowDays: 180,
};

let clonePath: string | undefined;

afterEach(async () => {
  if (clonePath) await rm(clonePath, { recursive: true, force: true });
  clonePath = undefined;
});

async function withClone(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'onboarding-facts-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  clonePath = dir;
  return dir;
}

describe('assembleFacts', () => {
  it('never touches an LLM and derives structure only from the indexed path set (AC-1, AC-3)', async () => {
    const dir = await withClone({
      'package.json': JSON.stringify({ name: 'x', scripts: { dev: 'next dev' } }),
      // A file that exists on disk but is NOT part of the indexed set below —
      // it must never appear in the derived directory skeleton.
      'src/not-indexed/secret.ts': 'export const nope = 1;',
    });

    const weighted = [weightedRow('src/a.ts', 0.9), weightedRow('src/b/c.ts', 0.5)];
    const repoIntel = new FakeRepoIntel({ state: STATE, weighted, chains: [] });

    const facts = await assembleFacts({ repoId: 'repo-1', clonePath: dir, repoIntel });

    expect(facts.allIndexedPaths.has('src/not-indexed/secret.ts')).toBe(false);
    expect(facts.directory).not.toContain('src/not-indexed');
    expect(facts.directory).toEqual(expect.arrayContaining(['src', 'src/b']));
    expect(facts.rankedFiles.map((r) => r.path)).toEqual(['src/a.ts', 'src/b/c.ts']);
  });

  it('includes AC-18 coverage facts (indexed count, excluded-by-bound, status, PRs weighted)', async () => {
    const dir = await withClone({ 'package.json': '{}' });
    const repoIntel = new FakeRepoIntel({ state: STATE, weighted: [], chains: [] });
    const facts = await assembleFacts({ repoId: 'repo-1', clonePath: dir, repoIntel });

    expect(facts.coverage.filesIndexed).toBe(120);
    expect(facts.coverage.filesExcluded).toBe(5);
    expect(facts.coverage.indexStatus).toBe('full');
    expect(facts.coverage.prsWeighted).toBe(12);
    expect(facts.coverage.hotnessWindowDays).toBe(180);
  });

  it('bounds the ranked pool and reading path, and requests critical-path roots up to CRITICAL_PATHS_MAX', async () => {
    const dir = await withClone({ 'package.json': '{}' });
    const weighted = Array.from({ length: 100 }, (_, i) => weightedRow(`src/f${i}.ts`, 1 - i / 100));
    const repoIntel = new FakeRepoIntel({ state: STATE, weighted, chains: [] });

    const facts = await assembleFacts({ repoId: 'repo-1', clonePath: dir, repoIntel });

    expect(facts.rankedFiles).toHaveLength(FACT_RANKED_FILES);
    expect(facts.readingPath).toHaveLength(READING_PATH_MAX);
    expect(facts.readingPath[0]!.path).toBe('src/f0.ts'); // highest-weighted first

    const criticalCall = repoIntel.calls.getCriticalPaths?.[0];
    expect(criticalCall?.[1]).toEqual({ order: 'weighted', roots: CRITICAL_PATHS_MAX });

    const allPathsCall = repoIntel.calls.getWeightedRankedFiles?.[0];
    expect(allPathsCall?.[1]).toBe(FACT_ALL_PATHS_POOL);
  });

  it('maps critical-path chains to {root, chain} and degrades to [] when the graph has no edges', async () => {
    const dir = await withClone({ 'package.json': '{}' });
    const weighted = [weightedRow('src/a.ts', 1), weightedRow('src/b.ts', 0.5)];
    const repoIntel = new FakeRepoIntel({
      state: STATE,
      weighted,
      chains: [['src/a.ts', 'src/b.ts']],
    });
    const facts = await assembleFacts({ repoId: 'repo-1', clonePath: dir, repoIntel });
    expect(facts.criticalPaths).toEqual([{ root: 'src/a.ts', chain: ['src/a.ts', 'src/b.ts'] }]);

    const repoIntelEmpty = new FakeRepoIntel({ state: STATE, weighted, chains: [] });
    const factsEmpty = await assembleFacts({ repoId: 'repo-1', clonePath: dir, repoIntel: repoIntelEmpty });
    expect(factsEmpty.criticalPaths).toEqual([]);
  });

  it('degrades stack/setup facts to empty when the repo has no checkout (AC-37 upstream)', async () => {
    const repoIntel = new FakeRepoIntel({ state: STATE, weighted: [], chains: [] });
    const facts = await assembleFacts({ repoId: 'repo-1', clonePath: null, repoIntel });
    expect(facts.stack).toEqual({ frameworks: [] });
    expect(facts.setupCandidates).toEqual([]);
  });

  // ---------------------------------------------------------------------
  // 2026-08-14 test-quality WARNING (80% confidence): "allIndexedPaths
  // (facts.ts:~155-160) is junk-filtered in a way that may cause valid
  // citations to be dropped." `assembleFacts` never filters anything itself
  // — `allIndexedPaths` is `new Set(allPathsRows.map(r => r.path))` over
  // whatever `RepoIntelPort.getWeightedRankedFiles` returns, verbatim. The
  // WARNING traced back to an over-broad `isJunkPath` one layer up in
  // `repo-intel/service.ts` (bare substring match on 'eslint', 'prettier',
  // 'jest.', etc. anywhere in the path, not path-segment/basename-anchored)
  // — confirmed real and fixed there (2026-08-15); see
  // repo-intel-weighted-service.test.ts for the regression coverage. The
  // test below establishes that facts.ts itself adds no filtering on top of
  // whatever the (now-fixed) port hands it.
  // ---------------------------------------------------------------------
  it('applies NO filtering of its own — a legitimately-indexed path is preserved verbatim in allIndexedPaths whatever the port returns', async () => {
    const dir = await withClone({ 'package.json': '{}' });
    // A real application source file for an eslint-plugin PACKAGE's own
    // implementation (not a lint config) — its repo-relative path merely
    // CONTAINS the substring "eslint".
    const weighted = [weightedRow('src/eslint-plugin-custom/index.ts', 0.8), weightedRow('src/a.ts', 0.5)];
    const repoIntel = new FakeRepoIntel({ state: STATE, weighted, chains: [] });
    const facts = await assembleFacts({ repoId: 'repo-1', clonePath: dir, repoIntel });

    // Whatever the port returns survives into allIndexedPaths unmodified —
    // proving facts.ts is not where the WARNING's over-filtering happened.
    expect(facts.allIndexedPaths.has('src/eslint-plugin-custom/index.ts')).toBe(true);
    expect(facts.rankedFiles.map((r) => r.path)).toContain('src/eslint-plugin-custom/index.ts');
  });
});
