/**
 * SPEC-16 / plan 16, T1 — characterization net for `runFullIndex` / `runIncremental`.
 *
 * Complements indexer-pipeline.test.ts (which already pins the main branches)
 * by pinning WHICH collaborators (`git`, `depgraph`, `tokenizer`) each branch
 * calls, and with what arguments. Phase 2 changes the first parameter from
 * `Container` to `{ git, depgraph, tokenizer }`; only `makeDeps` changes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runFullIndex } from '../src/modules/repo-intel/pipeline/full.js';
import { runIncremental } from '../src/modules/repo-intel/pipeline/incremental.js';
import type { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import {
  DEFAULT_REPO_MAP_TOKEN_BUDGET,
  INDEXER_VERSION,
} from '../src/modules/repo-intel/constants.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';
import type { PipelineDeps } from '../src/modules/repo-intel/deps.js';

// ---------------------------------------------------------------------------
// Recording fakes
// ---------------------------------------------------------------------------

interface Rec {
  git: string[];
  depgraph: Array<{ clonePath: string; files: string[] }>;
  tokenizer: number;
  repo: string[];
  putRepoMapCache: Array<{ sha: string; budget: number }>;
}

interface DepsOpts {
  head?: () => Promise<string>;
  diff?: (base: string, head: string) => Promise<string[]>;
  buildEdges?: () => Promise<Array<{ from: string; to: string }>>;
}

/** THE ONE factory (Phase 2 rewrites its return type only). */
function makeDeps(opts: DepsOpts = {}) {
  const rec: Rec = { git: [], depgraph: [], tokenizer: 0, repo: [], putRepoMapCache: [] };
  const container = {
    git: {
      currentHead: async () => {
        rec.git.push('currentHead');
        return opts.head ? opts.head() : 'sha-head';
      },
      diffNameOnly: async (_ref: unknown, base: string, head: string) => {
        rec.git.push(`diffNameOnly:${base}..${head}`);
        return opts.diff ? opts.diff(base, head) : [];
      },
    },
    depgraph: {
      buildEdges: async (clonePath: string, files: string[]) => {
        rec.depgraph.push({ clonePath, files: [...files] });
        return opts.buildEdges ? opts.buildEdges() : [];
      },
    },
    tokenizer: {
      count: (text: string) => {
        rec.tokenizer += 1;
        return Math.ceil(text.length / 4);
      },
    },
  } as unknown as PipelineDeps;
  return { deps: container, rec };
}

function makeRepo(
  rec: Rec,
  opts: { clonePath: string | null; state?: IndexState | null },
) {
  let state: IndexState | null = opts.state ?? null;
  const upserts: Array<{
    status: string;
    lastIndexedSha: string;
    filesIndexed: number;
    filesSkipped: number;
    stats: Record<string, unknown>;
  }> = [];
  const note = (n: string) => async () => {
    rec.repo.push(n);
  };
  const stub = {
    getRepoBasics: async () => ({
      id: 'r1',
      owner: 'acme',
      name: 'app',
      defaultBranch: 'main',
      clonePath: opts.clonePath,
    }),
    tryGetIndexState: async () => state,
    deleteAllForRepo: note('deleteAllForRepo'),
    deleteForFiles: note('deleteForFiles'),
    insertSymbols: note('insertSymbols'),
    insertReferences: note('insertReferences'),
    upsertIndexState: async (s: (typeof upserts)[number] & { repoId: string; indexerVersion: number }) => {
      rec.repo.push('upsertIndexState');
      upserts.push(s);
      state = {
        repoId: s.repoId,
        status: s.status as IndexState['status'],
        filesIndexed: s.filesIndexed,
        filesSkipped: s.filesSkipped,
        durationMs: 0,
        lastIndexedSha: s.lastIndexedSha,
        indexerVersion: s.indexerVersion,
        updatedAt: new Date(),
      };
    },
    touchIndexState: note('touchIndexState'),
    advanceSha: async (_id: string, sha: string) => {
      rec.repo.push(`advanceSha:${sha}`);
    },
    replaceEdges: async (_id: string, rows: unknown[]) => {
      rec.repo.push(`replaceEdges:${rows.length}`);
    },
    replaceFileRank: note('replaceFileRank'),
    replaceFileFacts: note('replaceFileFacts'),
    patchFileFacts: note('patchFileFacts'),
    resolveReferences: async (_id: string, o: { reset: boolean }) => {
      rec.repo.push(`resolveReferences:reset=${o.reset}`);
    },
    getRepoMapCandidates: async () => [],
    deleteRepoMapCache: note('deleteRepoMapCache'),
    putRepoMapCache: async (_id: string, sha: string, budget: number) => {
      rec.repo.push('putRepoMapCache');
      rec.putRepoMapCache.push({ sha, budget });
    },
    getPrChurn: async () => ({ counts: [], prsConsidered: 0 }),
  };
  return { repo: stub as unknown as RepoIntelRepository, upserts };
}

function priorState(overrides?: Partial<IndexState>): IndexState {
  return {
    repoId: 'r1',
    status: 'full',
    filesIndexed: 5,
    filesSkipped: 1,
    durationMs: 10,
    lastIndexedSha: 'sha-old',
    indexerVersion: INDEXER_VERSION,
    updatedAt: new Date(0),
    ...overrides,
  };
}

async function put(root: string, rel: string, body: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive: true });
  await writeFile(full, body);
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'repo-intel-char-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// runFullIndex
// ---------------------------------------------------------------------------

describe('runFullIndex — collaborator usage', () => {
  it('clean pass: git.currentHead once, depgraph.buildEdges(clonePath, walked files), tokenizer used for the repo-map, map cached under the head sha', async () => {
    await put(root, 'src/a.ts', 'export function a() { return 1; }\n');
    await put(root, 'src/b.ts', 'export function b() { return 2; }\n');
    const { deps, rec } = makeDeps();
    const { repo, upserts } = makeRepo(rec, { clonePath: root });

    const result = await runFullIndex(deps, repo, { repoId: 'r1' });

    expect(result.status).toBe('full');
    expect(result.reason).toBeUndefined();
    expect(rec.git).toEqual(['currentHead']);
    expect(rec.depgraph).toHaveLength(1);
    expect(rec.depgraph[0]!.clonePath).toBe(root);
    expect([...rec.depgraph[0]!.files].sort()).toEqual(['src/a.ts', 'src/b.ts']);
    // repo-map render ran against the injected tokenizer (candidates are [] here,
    // but renderRepoMap is still handed the tokenizer — pin the cache write).
    expect(rec.putRepoMapCache).toEqual([
      { sha: 'sha-head', budget: DEFAULT_REPO_MAP_TOKEN_BUDGET },
    ]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ status: 'full', lastIndexedSha: 'sha-head', filesIndexed: 2 });
  });

  it('persist order: deleteAllForRepo → insertSymbols → insertReferences → replaceEdges → resolveReferences(reset=false) → replaceFileRank → repo-map cache → replaceFileFacts → upsertIndexState', async () => {
    await put(root, 'src/a.ts', 'export function a() { return 1; }\n');
    const { deps, rec } = makeDeps();
    const { repo } = makeRepo(rec, { clonePath: root });

    await runFullIndex(deps, repo, { repoId: 'r1' });

    expect(rec.repo).toEqual([
      'deleteAllForRepo',
      'insertSymbols',
      'insertReferences',
      'replaceEdges:0',
      'resolveReferences:reset=false',
      'replaceFileRank',
      'deleteRepoMapCache',
      'putRepoMapCache',
      'replaceFileFacts',
      'upsertIndexState',
    ]);
  });

  it("git.currentHead throwing → sha '' is persisted and NO repo-map cache entry is written", async () => {
    await put(root, 'src/a.ts', 'export function a() { return 1; }\n');
    const { deps, rec } = makeDeps({
      head: async () => {
        throw new Error('detached');
      },
    });
    const { repo, upserts } = makeRepo(rec, { clonePath: root });

    const result = await runFullIndex(deps, repo, { repoId: 'r1' });

    expect(result.status).toBe('full');
    expect(upserts[0]!.lastIndexedSha).toBe('');
    expect(rec.putRepoMapCache).toEqual([]);
    expect(rec.repo).toContain('deleteRepoMapCache'); // stale entries still dropped
  });

  it("depgraph.buildEdges throwing → status 'partial', reason 'graph_failed', stats.graphFailed carries the message, rank/map still run", async () => {
    await put(root, 'src/a.ts', 'export function a() { return 1; }\n');
    const { deps, rec } = makeDeps({
      buildEdges: async () => {
        throw new Error('cruiser crashed');
      },
    });
    const { repo, upserts } = makeRepo(rec, { clonePath: root });

    const result = await runFullIndex(deps, repo, { repoId: 'r1' });

    expect(result.status).toBe('partial');
    expect(result.reason).toBe('graph_failed');
    expect(upserts[0]!.stats.graphFailed).toBe('cruiser crashed');
    expect(rec.repo).toContain('replaceEdges:0');
    expect(rec.repo).toContain('replaceFileRank');
    expect(rec.putRepoMapCache).toHaveLength(1);
  });

  it('depgraph edges are mapped {from,to} → {fromFile,toFile} and counted in stats.edgesWritten', async () => {
    await put(root, 'src/a.ts', "import { b } from './b';\nexport function a() { return b(); }\n");
    await put(root, 'src/b.ts', 'export function b() { return 2; }\n');
    const { deps, rec } = makeDeps({
      buildEdges: async () => [{ from: 'src/a.ts', to: 'src/b.ts' }],
    });
    const { repo, upserts } = makeRepo(rec, { clonePath: root });

    await runFullIndex(deps, repo, { repoId: 'r1' });

    expect(rec.repo).toContain('replaceEdges:1');
    expect(upserts[0]!.stats.edgesWritten).toBe(1);
    expect(upserts[0]!.stats.ranked).toBe(2);
  });

  it('no clone → degraded no_clone; git/depgraph/tokenizer are never touched', async () => {
    const { deps, rec } = makeDeps();
    const { repo, upserts } = makeRepo(rec, { clonePath: null });

    const result = await runFullIndex(deps, repo, { repoId: 'r1' });

    expect(result).toMatchObject({ status: 'degraded', reason: 'no_clone' });
    expect(rec.git).toEqual([]);
    expect(rec.depgraph).toEqual([]);
    expect(rec.tokenizer).toBe(0);
    expect(upserts[0]).toMatchObject({ status: 'degraded', lastIndexedSha: '' });
  });

  it('empty clone (no supported files) → partial no_files; git.currentHead is read but depgraph is NOT', async () => {
    await put(root, 'README.md', '# nothing');
    const { deps, rec } = makeDeps();
    const { repo } = makeRepo(rec, { clonePath: root });

    const result = await runFullIndex(deps, repo, { repoId: 'r1' });

    expect(result).toMatchObject({ status: 'partial', reason: 'no_files', filesIndexed: 0 });
    expect(rec.git).toEqual(['currentHead']);
    expect(rec.depgraph).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runIncremental
// ---------------------------------------------------------------------------

describe('runIncremental — collaborator usage per branch', () => {
  it('no clone → degraded no_clone; git never touched', async () => {
    const { deps, rec } = makeDeps();
    const { repo } = makeRepo(rec, { clonePath: null, state: priorState() });

    const result = await runIncremental(deps, repo, { repoId: 'r1' });

    expect(result).toMatchObject({ status: 'degraded', reason: 'no_clone' });
    expect(rec.git).toEqual([]);
  });

  it('no state row → delegates to full index (currentHead once, depgraph once, NO diffNameOnly)', async () => {
    await put(root, 'src/a.ts', 'export function a() { return 1; }\n');
    const { deps, rec } = makeDeps();
    const { repo } = makeRepo(rec, { clonePath: root, state: null });

    const result = await runIncremental(deps, repo, { repoId: 'r1' });

    expect(result.status).toBe('full');
    expect(rec.git).toEqual(['currentHead']);
    expect(rec.depgraph).toHaveLength(1);
    expect(rec.repo).toContain('deleteAllForRepo');
  });

  it('indexer-version mismatch → delegates to full index (no diffNameOnly)', async () => {
    await put(root, 'src/a.ts', 'export function a() { return 1; }\n');
    const { deps, rec } = makeDeps();
    const { repo } = makeRepo(rec, {
      clonePath: root,
      state: priorState({ indexerVersion: INDEXER_VERSION - 1 }),
    });

    await runIncremental(deps, repo, { repoId: 'r1' });

    expect(rec.git).toEqual(['currentHead']);
    expect(rec.repo).toContain('deleteAllForRepo');
  });

  it('git.currentHead throwing → degraded git_head_failed:<msg>; no writes at all', async () => {
    const { deps, rec } = makeDeps({
      head: async () => {
        throw new Error('no head');
      },
    });
    const { repo } = makeRepo(rec, { clonePath: root, state: priorState() });

    const result = await runIncremental(deps, repo, { repoId: 'r1' });

    expect(result).toMatchObject({
      status: 'degraded',
      reason: 'git_head_failed:no head',
      filesIndexed: 0,
      filesSkipped: 0,
    });
    expect(rec.repo).toEqual([]);
    expect(rec.depgraph).toEqual([]);
  });

  it('sha unchanged → returns prior status/counters, touches only; no diff, no depgraph, no tokenizer', async () => {
    const { deps, rec } = makeDeps({ head: async () => 'sha-old' });
    const { repo } = makeRepo(rec, { clonePath: root, state: priorState() });

    const result = await runIncremental(deps, repo, { repoId: 'r1' });

    expect(result).toMatchObject({
      status: 'full',
      filesIndexed: 5,
      filesSkipped: 1,
      reason: 'sha_unchanged',
    });
    expect(rec.git).toEqual(['currentHead']);
    expect(rec.repo).toEqual(['touchIndexState']);
    expect(rec.depgraph).toEqual([]);
    expect(rec.tokenizer).toBe(0);
  });

  it('diffNameOnly receives (lastIndexedSha, currentHead); only unsupported ext changed → advanceSha(head), no depgraph', async () => {
    const { deps, rec } = makeDeps({
      head: async () => 'sha-new',
      diff: async () => ['README.md', 'package.json'],
    });
    const { repo } = makeRepo(rec, { clonePath: root, state: priorState() });

    const result = await runIncremental(deps, repo, { repoId: 'r1' });

    expect(rec.git).toEqual(['currentHead', 'diffNameOnly:sha-old..sha-new']);
    expect(result).toMatchObject({ status: 'full', filesIndexed: 5, reason: 'no_supported_changes' });
    expect(rec.repo).toEqual(['advanceSha:sha-new']);
    expect(rec.depgraph).toEqual([]);
  });

  it('diffNameOnly throwing → falls back to full index (deleteAllForRepo, new sha persisted)', async () => {
    await put(root, 'src/a.ts', 'export function a() { return 1; }\n');
    const { deps, rec } = makeDeps({
      head: async () => 'sha-new',
      diff: async () => {
        throw new Error('shallow');
      },
    });
    const { repo, upserts } = makeRepo(rec, { clonePath: root, state: priorState() });

    const result = await runIncremental(deps, repo, { repoId: 'r1' });

    expect(result.status).toBe('full');
    // full re-reads HEAD → currentHead called twice in total
    expect(rec.git).toEqual(['currentHead', 'diffNameOnly:sha-old..sha-new', 'currentHead']);
    expect(rec.repo).toContain('deleteAllForRepo');
    expect(upserts.at(-1)!.lastIndexedSha).toBe('sha-new');
  });

  it('exactly 300 changed supported files stays on the slice path; 301 delegates to full', async () => {
    await put(root, 'src/a.ts', 'export function a() { return 1; }\n');
    const mk = (n: number) => Array.from({ length: n }, (_, i) => `src/missing-${i}.ts`);

    const at = makeDeps({ head: async () => 'sha-new', diff: async () => mk(300) });
    const atRepo = makeRepo(at.rec, { clonePath: root, state: priorState() });
    const r300 = await runIncremental(at.deps, atRepo.repo, { repoId: 'r1' });
    expect(r300.reason).toBe('incremental');
    expect(at.rec.repo).not.toContain('deleteAllForRepo');
    expect(at.rec.repo).toContain('deleteForFiles');

    const over = makeDeps({ head: async () => 'sha-new', diff: async () => mk(301) });
    const overRepo = makeRepo(over.rec, { clonePath: root, state: priorState() });
    const r301 = await runIncremental(over.deps, overRepo.repo, { repoId: 'r1' });
    expect(r301.reason).not.toBe('incremental');
    expect(over.rec.repo).toContain('deleteAllForRepo');
  });

  it('slice path: reparses the changed file, rebuilds graph over the FULL walk, resolveReferences(reset=true), repo-map cached under the NEW sha, counters accumulate', async () => {
    await put(root, 'src/changed.ts', 'export function fresh(x: number) { return x; }\n');
    await put(root, 'src/other.ts', 'export function other() { return 0; }\n');
    const { deps, rec } = makeDeps({
      head: async () => 'sha-new',
      diff: async () => ['src/changed.ts'],
    });
    const { repo, upserts } = makeRepo(rec, { clonePath: root, state: priorState() });

    const result = await runIncremental(deps, repo, { repoId: 'r1' });

    expect(result).toMatchObject({ status: 'full', filesIndexed: 1, reason: 'incremental' });
    // graph is built over every walked file, not just the changed slice
    expect([...rec.depgraph[0]!.files].sort()).toEqual(['src/changed.ts', 'src/other.ts']);
    expect(rec.repo).toEqual([
      'deleteForFiles',
      'insertSymbols',
      'insertReferences',
      'patchFileFacts',
      'replaceEdges:0',
      'resolveReferences:reset=true',
      'replaceFileRank',
      'deleteRepoMapCache',
      'putRepoMapCache',
      'upsertIndexState',
    ]);
    expect(rec.putRepoMapCache).toEqual([
      { sha: 'sha-new', budget: DEFAULT_REPO_MAP_TOKEN_BUDGET },
    ]);
    expect(upserts[0]).toMatchObject({
      status: 'full', // prior full + clean slice stays full
      lastIndexedSha: 'sha-new',
      filesIndexed: 6, // 5 prior + 1
      filesSkipped: 1, // prior 1 + 0
    });
    expect(upserts[0]!.stats).toMatchObject({ incremental: true, changedFiles: 1 });
  });

  it("slice path with a failing depgraph → status 'partial' (even from a full prior), stats.graphFailed set, repo-map NOT cached", async () => {
    await put(root, 'src/changed.ts', 'export function fresh(x: number) { return x; }\n');
    const { deps, rec } = makeDeps({
      head: async () => 'sha-new',
      diff: async () => ['src/changed.ts'],
      buildEdges: async () => {
        throw new Error('graph boom');
      },
    });
    const { repo, upserts } = makeRepo(rec, { clonePath: root, state: priorState() });

    const result = await runIncremental(deps, repo, { repoId: 'r1' });

    expect(result.status).toBe('partial');
    expect(result.reason).toBe('incremental');
    expect(upserts[0]!.stats.graphFailed).toBe('graph boom');
    expect(rec.putRepoMapCache).toEqual([]);
  });

  it('slice path with a deleted file: counted as skipped + parseDegraded, status partial', async () => {
    const { deps, rec } = makeDeps({
      head: async () => 'sha-new',
      diff: async () => ['src/gone.ts'],
    });
    const { repo, upserts } = makeRepo(rec, { clonePath: root, state: priorState() });

    const result = await runIncremental(deps, repo, { repoId: 'r1' });

    expect(result).toMatchObject({ status: 'partial', filesIndexed: 0, filesSkipped: 1 });
    expect(upserts[0]).toMatchObject({ filesIndexed: 5, filesSkipped: 2 });
    const degraded = upserts[0]!.stats.parseDegraded as Array<{ file: string }>;
    expect(degraded.map((d) => d.file)).toEqual(['src/gone.ts']);
  });
});
