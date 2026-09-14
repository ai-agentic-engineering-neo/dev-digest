/**
 * specs/10-onboarding-generator.md (D6) — pipeline wiring for real hotness.
 * `indexer-pipeline.test.ts` already covers the pipeline's flow/branches with
 * `getPrChurn` stubbed to the empty/no-history case (`{ counts: [], prsConsidered: 0 }`),
 * confirming the pre-D6 no-churn behavior still holds. This file covers what's
 * NEW: threading a non-empty `getPrChurn` result through `computeFileRank` into
 * the persisted `file_rank` rows, and the `stats.hotnessPrs` /
 * `stats.hotnessWindowDays` / `stats.hotnessAvailable` fields both
 * `pipeline/full.ts` and `pipeline/incremental.ts` now stamp.
 *
 * No real DB (same in-memory repository-stub pattern as indexer-pipeline.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runFullIndex } from '../src/modules/repo-intel/pipeline/full.js';
import { runIncremental } from '../src/modules/repo-intel/pipeline/incremental.js';
import type {
  IndexerFileRankRow,
  PrChurnResult,
  RepoIntelRepository,
} from '../src/modules/repo-intel/repository.js';
import { HOTNESS_WINDOW_DAYS, INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';
import type { Container } from '../src/platform/container.js';

interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

function makeRepoStub(opts: { basics: RepoBasics | null; initialState?: IndexState | null; churn: PrChurnResult }) {
  let state: IndexState | null = opts.initialState ?? null;
  let lastFileRankRows: IndexerFileRankRow[] = [];
  let lastStats: Record<string, unknown> = {};
  let churnCallCount = 0;

  const stub = {
    getRepoBasics: async () => opts.basics,
    tryGetIndexState: async () => state,
    deleteAllForRepo: async () => {},
    deleteForFiles: async () => {},
    insertSymbols: async () => {},
    insertReferences: async () => {},
    upsertIndexState: async (s: {
      repoId: string;
      lastIndexedSha: string;
      indexerVersion: number;
      status: 'full' | 'partial' | 'degraded' | 'failed';
      filesIndexed: number;
      filesSkipped: number;
      stats: Record<string, unknown>;
    }) => {
      lastStats = s.stats;
      state = {
        repoId: s.repoId,
        status: s.status,
        filesIndexed: s.filesIndexed,
        filesSkipped: s.filesSkipped,
        durationMs: typeof s.stats.durationMs === 'number' ? (s.stats.durationMs as number) : 0,
        reason: typeof s.stats.reason === 'string' ? (s.stats.reason as string) : undefined,
        lastIndexedSha: s.lastIndexedSha,
        indexerVersion: s.indexerVersion,
        updatedAt: new Date(),
      };
    },
    touchIndexState: async () => {
      if (state) state = { ...state, updatedAt: new Date() };
    },
    advanceSha: async (_id: string, sha: string) => {
      if (state) state = { ...state, lastIndexedSha: sha, updatedAt: new Date() };
    },
    replaceEdges: async () => {},
    replaceFileRank: async (_repoId: string, rows: IndexerFileRankRow[]) => {
      lastFileRankRows = rows;
    },
    replaceFileFacts: async () => {},
    patchFileFacts: async () => {},
    resolveReferences: async () => {},
    getRepoMapCandidates: async () => [],
    deleteRepoMapCache: async () => {},
    putRepoMapCache: async () => {},
    getPrChurn: async () => {
      churnCallCount += 1;
      return opts.churn;
    },
  };

  return {
    repo: stub as unknown as RepoIntelRepository,
    getState: () => state,
    getLastStats: () => lastStats,
    getLastFileRankRows: () => lastFileRankRows,
    getChurnCallCount: () => churnCallCount,
  };
}

function makeContainer(overrides?: Partial<{ diffNameOnly: (...args: unknown[]) => Promise<string[]> }>): Container {
  return {
    git: {
      currentHead: async () => 'sha-head',
      diffNameOnly: overrides?.diffNameOnly ?? (async () => []),
    },
    depgraph: { buildEdges: async () => [] },
    tokenizer: { count: (text: string) => Math.ceil(text.length / 4) },
  } as unknown as Container;
}

async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  const slash = full.lastIndexOf('/');
  if (slash > 0) await mkdir(full.slice(0, slash), { recursive: true });
  await writeFile(full, contents);
}

describe('runFullIndex — real hotness wiring (D6)', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'repo-intel-hot-full-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('threads getPrChurn counts into computeFileRank and stamps hotnessPrs/hotnessWindowDays/hotnessAvailable=true', async () => {
    await writeFileAt(root, 'src/hot.ts', 'export function h() { return 1; }\n');
    await writeFileAt(root, 'src/cold.ts', 'export function c() { return 2; }\n');

    const stub = makeRepoStub({
      basics: { id: 'r1', owner: 'acme', name: 'app', clonePath: root },
      churn: { counts: [{ path: 'src/hot.ts', prs: 9 }], prsConsidered: 9 },
    });

    const result = await runFullIndex(makeContainer(), stub.repo, { repoId: 'r1' });
    expect(result.status).toBe('full');
    expect(stub.getChurnCallCount()).toBe(1);

    const rows = stub.getLastFileRankRows();
    const byPath = new Map(rows.map((r) => [r.filePath, r]));
    expect(byPath.get('src/hot.ts')!.hotness).toBeCloseTo(1, 10);
    expect(byPath.get('src/cold.ts')!.hotness).toBe(0);
    // rank stays = pagerank (D7) even though hotness varies.
    for (const r of rows) expect(r.rank).toBe(r.pagerank);

    const stats = stub.getLastStats();
    expect(stats.hotnessPrs).toBe(9);
    expect(stats.hotnessWindowDays).toBe(HOTNESS_WINDOW_DAYS);
    expect(stats.hotnessAvailable).toBe(true);
  });

  it('zero PR history -> hotnessAvailable=false, every hotness=0 (regression: identical to the pre-D6 pipeline output)', async () => {
    await writeFileAt(root, 'src/only.ts', 'export function o() { return 1; }\n');
    const stub = makeRepoStub({
      basics: { id: 'r2', owner: 'acme', name: 'app', clonePath: root },
      churn: { counts: [], prsConsidered: 0 },
    });

    await runFullIndex(makeContainer(), stub.repo, { repoId: 'r2' });
    const rows = stub.getLastFileRankRows();
    expect(rows.every((r) => r.hotness === 0)).toBe(true);
    const stats = stub.getLastStats();
    expect(stats.hotnessPrs).toBe(0);
    expect(stats.hotnessAvailable).toBe(false);
  });

  it('getPrChurn is still called (and hotness still 0) on a graphFailed pass — hotness is independent of the import graph', async () => {
    await writeFileAt(root, 'src/only.ts', 'export function o() { return 1; }\n');
    const stub = makeRepoStub({
      basics: { id: 'r3', owner: 'acme', name: 'app', clonePath: root },
      churn: { counts: [{ path: 'src/only.ts', prs: 3 }], prsConsidered: 3 },
    });
    const container = {
      git: { currentHead: async () => 'sha-head', diffNameOnly: async () => [] },
      depgraph: {
        buildEdges: async () => {
          throw new Error('graph build blew up');
        },
      },
      tokenizer: { count: (t: string) => Math.ceil(t.length / 4) },
    } as unknown as Container;

    const result = await runFullIndex(container, stub.repo, { repoId: 'r3' });
    expect(result.status).toBe('partial'); // graphFailed keeps it honest
    expect(stub.getChurnCallCount()).toBe(1);
    const rows = stub.getLastFileRankRows();
    expect(rows.find((r) => r.filePath === 'src/only.ts')!.hotness).toBeCloseTo(1, 10);
  });
});

describe('runIncremental — real hotness wiring (D6)', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'repo-intel-hot-inc-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function makeInitialState(overrides?: Partial<IndexState>): IndexState {
    return {
      repoId: 'r1',
      status: 'full',
      filesIndexed: 1,
      filesSkipped: 0,
      durationMs: 100,
      lastIndexedSha: 'sha-old',
      indexerVersion: INDEXER_VERSION,
      updatedAt: new Date(0),
      ...overrides,
    };
  }

  it('reparse slice path re-fetches getPrChurn (same source as full index) and stamps the same hotness stats', async () => {
    await writeFileAt(root, 'src/changed.ts', 'export function fresh(x: number) { return x; }\n');
    await writeFileAt(root, 'src/stable.ts', 'export function stable() { return 1; }\n');

    const stub = makeRepoStub({
      basics: { id: 'r1', owner: 'acme', name: 'app', clonePath: root },
      initialState: makeInitialState(),
      churn: { counts: [{ path: 'src/changed.ts', prs: 4 }], prsConsidered: 4 },
    });
    const container = makeContainer({ diffNameOnly: async () => ['src/changed.ts'] });

    const result = await runIncremental(container, stub.repo, { repoId: 'r1' });
    // Clean slice reparse (no parse errors, no graph failure) over a prior
    // status='full' index stays 'full'.
    expect(result.status).toBe('full');
    expect(stub.getChurnCallCount()).toBe(1);

    const rows = stub.getLastFileRankRows();
    const byPath = new Map(rows.map((r) => [r.filePath, r]));
    expect(byPath.get('src/changed.ts')!.hotness).toBeCloseTo(1, 10);
    expect(byPath.get('src/stable.ts')!.hotness).toBe(0);

    const stats = stub.getLastStats();
    expect(stats.hotnessPrs).toBe(4);
    expect(stats.hotnessWindowDays).toBe(HOTNESS_WINDOW_DAYS);
    expect(stats.hotnessAvailable).toBe(true);
  });

  it('zero PR history on an incremental refresh -> hotnessAvailable=false, matching runFullIndex', async () => {
    await writeFileAt(root, 'src/changed.ts', 'export function fresh() { return 1; }\n');
    const stub = makeRepoStub({
      basics: { id: 'r1', owner: 'acme', name: 'app', clonePath: root },
      initialState: makeInitialState(),
      churn: { counts: [], prsConsidered: 0 },
    });
    const container = makeContainer({ diffNameOnly: async () => ['src/changed.ts'] });

    await runIncremental(container, stub.repo, { repoId: 'r1' });
    const stats = stub.getLastStats();
    expect(stats.hotnessPrs).toBe(0);
    expect(stats.hotnessAvailable).toBe(false);
  });

  it('sha-unchanged short-circuit never calls getPrChurn at all', async () => {
    const stub = makeRepoStub({
      basics: { id: 'r1', owner: 'acme', name: 'app', clonePath: root },
      initialState: makeInitialState({ lastIndexedSha: 'sha-same' }),
      churn: { counts: [{ path: 'anything.ts', prs: 99 }], prsConsidered: 99 },
    });
    const container = makeContainer();
    // currentHead defaults to 'sha-head' in makeContainer, differs from
    // 'sha-same' above — override to force the short-circuit branch.
    const sameShaContainer = {
      ...container,
      git: { currentHead: async () => 'sha-same', diffNameOnly: async () => {
        throw new Error('should not be called');
      } },
    } as unknown as Container;

    const result = await runIncremental(sameShaContainer, stub.repo, { repoId: 'r1' });
    expect(result.reason).toBe('sha_unchanged');
    expect(stub.getChurnCallCount()).toBe(0);
  });
});
