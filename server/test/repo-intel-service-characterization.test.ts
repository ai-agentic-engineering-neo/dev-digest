/**
 * SPEC-16 / plan 16, T1 — characterization net for `RepoIntelService`.
 *
 * Pins CURRENT behaviour (not "correct" behaviour) so the Phase-2 refactor
 * (constructor takes `(repo, deps)` instead of `Container`) can be proven
 * behaviour-preserving. Only `makeService` knows how the service is built;
 * the `it` bodies must survive the refactor unchanged.
 *
 * Covers:
 *   - registerIndexJobHandlers: exactly the 3 job kinds, each handler
 *     delegates to indexRepo / refreshIndex / resyncRepo with payload.repoId (AC-13)
 *   - resyncRepo: no_clone / sync_failed:<msg> / success → incremental
 *   - repoIntelEnabled=false → every flag-gated method returns its degraded
 *     value WITHOUT touching the repository (AC-7 / AC-8 evidence)
 *   - git / codeIndex / depgraph / tokenizer are read from the injected deps
 */
import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import {
  INDEXER_VERSION,
  INDEX_JOB_KIND,
  REFRESH_JOB_KIND,
  RESYNC_JOB_KIND,
} from '../src/modules/repo-intel/constants.js';
import type { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';
import type { Container } from '../src/platform/container.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface Basics {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

type Handler = (payload: unknown) => Promise<void>;

/** Records `register(kind, handler)` calls, in order. */
class FakeJobs {
  readonly handlers = new Map<string, Handler>();
  readonly order: string[] = [];
  register(kind: string, handler: Handler): void {
    this.order.push(kind);
    this.handlers.set(kind, handler);
  }
}

/** Repository whose every method throws — proves a code path never reached it. */
function throwingRepo(): RepoIntelRepository {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        return () => {
          throw new Error(`repo.${String(prop)} must not be called`);
        };
      },
    },
  ) as unknown as RepoIntelRepository;
}

function stateAt(sha: string): IndexState {
  return {
    repoId: 'r1',
    status: 'full',
    filesIndexed: 3,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: sha,
    indexerVersion: INDEXER_VERSION,
    updatedAt: new Date(),
  };
}

interface Fakes {
  repo?: Partial<Record<string, unknown>> | RepoIntelRepository;
  git?: MockGitClient;
  jobs?: FakeJobs;
  codeIndex?: unknown;
  repoIntelEnabled?: boolean;
}

/**
 * THE ONE factory. Phase 2 changes only this function's body
 * (`new RepoIntelService(repo, { git, codeIndex, jobs, depgraph, tokenizer, repoIntelEnabled })`).
 */
function makeService(fakes: Fakes = {}) {
  const git = fakes.git ?? new MockGitClient({});
  const jobs = fakes.jobs ?? new FakeJobs();
  const calls = { buildEdges: 0, tokenCount: 0 };
  const container = {
    git,
    jobs,
    db: {}, // never queried — repo is overridden below
    codeIndex: fakes.codeIndex ?? { symbols: async () => [], references: async () => [] },
    depgraph: {
      buildEdges: async () => {
        calls.buildEdges += 1;
        return [];
      },
    },
    tokenizer: {
      count: (text: string) => {
        calls.tokenCount += 1;
        return Math.ceil(text.length / 4);
      },
    },
    config: { repoIntelEnabled: fakes.repoIntelEnabled ?? true },
  } as unknown as Container;

  const service = new RepoIntelService(container);
  (service as unknown as { repo: unknown }).repo = fakes.repo ?? throwingRepo();
  return { service, git, jobs, calls };
}

/** A repo stub good enough to run the cheap `sha_unchanged` incremental branch. */
function incrementalRepo(basics: Basics | null, state: IndexState | null) {
  const log: string[] = [];
  const repo = {
    getRepoBasics: async (id: string) => {
      log.push(`getRepoBasics:${id}`);
      return basics;
    },
    tryGetIndexState: async (id: string) => {
      log.push(`tryGetIndexState:${id}`);
      return state;
    },
    touchIndexState: async (id: string) => {
      log.push(`touchIndexState:${id}`);
    },
  };
  return { repo, log };
}

const BASICS: Basics = {
  id: 'r1',
  owner: 'acme',
  name: 'app',
  defaultBranch: 'develop',
  clonePath: '/mock/clone',
};

// ---------------------------------------------------------------------------
// registerIndexJobHandlers (AC-13)
// ---------------------------------------------------------------------------

describe('RepoIntelService.registerIndexJobHandlers', () => {
  it('registers exactly INDEX, REFRESH and RESYNC kinds, in that order, on the injected job runner', () => {
    const jobs = new FakeJobs();
    const { service } = makeService({ jobs });

    service.registerIndexJobHandlers();

    expect(jobs.order).toEqual([INDEX_JOB_KIND, REFRESH_JOB_KIND, RESYNC_JOB_KIND]);
    expect([...jobs.handlers.keys()].sort()).toEqual(
      [INDEX_JOB_KIND, REFRESH_JOB_KIND, RESYNC_JOB_KIND].sort(),
    );
  });

  it('INDEX handler delegates to indexRepo(payload.repoId) and swallows the result', async () => {
    const jobs = new FakeJobs();
    const { service } = makeService({ jobs });
    const seen: string[] = [];
    service.indexRepo = async (id: string) => {
      seen.push(id);
      return { status: 'full', filesIndexed: 1, filesSkipped: 0, durationMs: 0 };
    };
    service.registerIndexJobHandlers();

    const out = await jobs.handlers.get(INDEX_JOB_KIND)!({ repoId: 'repo-A' });

    expect(seen).toEqual(['repo-A']);
    expect(out).toBeUndefined();
  });

  it('REFRESH handler delegates to refreshIndex(payload.repoId)', async () => {
    const jobs = new FakeJobs();
    const { service } = makeService({ jobs });
    const seen: string[] = [];
    service.refreshIndex = async (id: string) => {
      seen.push(id);
      return { status: 'full', filesIndexed: 1, filesSkipped: 0, durationMs: 0 };
    };
    service.registerIndexJobHandlers();

    await jobs.handlers.get(REFRESH_JOB_KIND)!({ repoId: 'repo-B' });

    expect(seen).toEqual(['repo-B']);
  });

  it('RESYNC handler delegates to resyncRepo(payload.repoId)', async () => {
    const jobs = new FakeJobs();
    const { service } = makeService({ jobs });
    const seen: string[] = [];
    service.resyncRepo = async (id: string) => {
      seen.push(id);
      return { status: 'full', filesIndexed: 1, filesSkipped: 0, durationMs: 0 };
    };
    service.registerIndexJobHandlers();

    await jobs.handlers.get(RESYNC_JOB_KIND)!({ repoId: 'repo-C' });

    expect(seen).toEqual(['repo-C']);
  });

  it('a handler that delegates to a throwing method rejects (errors are NOT swallowed)', async () => {
    const jobs = new FakeJobs();
    const { service } = makeService({ jobs });
    service.indexRepo = async () => {
      throw new Error('index exploded');
    };
    service.registerIndexJobHandlers();

    await expect(jobs.handlers.get(INDEX_JOB_KIND)!({ repoId: 'x' })).rejects.toThrow(
      'index exploded',
    );
  });
});

// ---------------------------------------------------------------------------
// resyncRepo
// ---------------------------------------------------------------------------

describe('RepoIntelService.resyncRepo', () => {
  it('missing repo row → degraded no_clone, zero counters, git.sync not called', async () => {
    const { repo } = incrementalRepo(null, null);
    const git = new MockGitClient({});
    const { service } = makeService({ repo, git });

    const result = await service.resyncRepo('r1');

    expect(result).toMatchObject({
      status: 'degraded',
      reason: 'no_clone',
      filesIndexed: 0,
      filesSkipped: 0,
    });
    expect(typeof result.durationMs).toBe('number');
    expect(git.syncs).toHaveLength(0);
  });

  it('clonePath null → degraded no_clone, git.sync not called', async () => {
    const { repo } = incrementalRepo({ ...BASICS, clonePath: null }, null);
    const git = new MockGitClient({});
    const { service } = makeService({ repo, git });

    const result = await service.resyncRepo('r1');

    expect(result).toMatchObject({
      status: 'degraded',
      reason: 'no_clone',
      filesIndexed: 0,
      filesSkipped: 0,
    });
    expect(git.syncs).toHaveLength(0);
  });

  it("git.sync throwing Error('boom') → degraded reason 'sync_failed:boom' (no incremental run)", async () => {
    const { repo, log } = incrementalRepo(BASICS, stateAt('sha-1'));
    const git = new MockGitClient({});
    git.sync = async () => {
      throw new Error('boom');
    };
    const { service } = makeService({ repo, git });

    const result = await service.resyncRepo('r1');

    expect(result).toMatchObject({
      status: 'degraded',
      reason: 'sync_failed:boom',
      filesIndexed: 0,
      filesSkipped: 0,
    });
    // Only the basics lookup happened; incremental never read the state row.
    expect(log).toEqual(['getRepoBasics:r1']);
  });

  it('non-Error rejection is stringified into the reason', async () => {
    const { repo } = incrementalRepo(BASICS, stateAt('sha-1'));
    const git = new MockGitClient({});
    git.sync = async () => {
      throw 'plain string'; // eslint-disable-line @typescript-eslint/only-throw-error
    };
    const { service } = makeService({ repo, git });

    const result = await service.resyncRepo('r1');

    expect(result.reason).toBe('sync_failed:plain string');
  });

  it("success → git.sync(ref, defaultBranch) then incremental ('sha_unchanged' branch)", async () => {
    const { repo, log } = incrementalRepo(BASICS, stateAt('sha-1'));
    const git = new MockGitClient({ head: 'sha-1', syncedHead: 'sha-1' });
    const { service } = makeService({ repo, git });

    const result = await service.resyncRepo('r1');

    expect(git.syncs).toHaveLength(1);
    expect(git.syncs[0]!.branch).toBe('develop');
    expect(result.reason).toBe('sha_unchanged');
    expect(result.status).toBe('full');
    expect(log).toEqual([
      'getRepoBasics:r1', // resyncRepo
      'getRepoBasics:r1', // runIncremental
      'tryGetIndexState:r1',
      'touchIndexState:r1',
    ]);
  });
});

// ---------------------------------------------------------------------------
// indexRepo / refreshIndex wiring to the injected collaborators
// ---------------------------------------------------------------------------

describe('RepoIntelService.indexRepo / refreshIndex', () => {
  it('indexRepo on a missing repo → degraded repo_not_found (no state row written)', async () => {
    const writes: string[] = [];
    const repo = {
      getRepoBasics: async () => null,
      upsertIndexState: async () => {
        writes.push('upsert');
      },
    };
    const { service } = makeService({ repo });

    const result = await service.indexRepo('gone');

    expect(result).toMatchObject({ status: 'degraded', reason: 'repo_not_found' });
    expect(writes).toEqual([]);
  });

  it('refreshIndex with unchanged sha reads HEAD from the injected git and returns sha_unchanged', async () => {
    const { repo } = incrementalRepo(BASICS, stateAt('sha-9'));
    const git = new MockGitClient({ head: 'sha-9' });
    const { service } = makeService({ repo, git });

    const result = await service.refreshIndex('r1');

    expect(result.reason).toBe('sha_unchanged');
    expect(result.filesIndexed).toBe(3);
  });

  it('refreshIndex with a failing git.currentHead → degraded git_head_failed:<msg>', async () => {
    const { repo } = incrementalRepo(BASICS, stateAt('sha-9'));
    const git = new MockGitClient({});
    git.currentHead = async () => {
      throw new Error('no head');
    };
    const { service } = makeService({ repo, git });

    const result = await service.refreshIndex('r1');

    expect(result).toMatchObject({
      status: 'degraded',
      reason: 'git_head_failed:no head',
      filesIndexed: 0,
      filesSkipped: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// repoIntelEnabled = false  (the 10 `repoIntelEnabled` read sites)
// ---------------------------------------------------------------------------

describe('RepoIntelService with repoIntelEnabled=false — never touches the repository', () => {
  // Each flag-gated method: one `it`, repo is a Proxy that throws on any call.
  const off = () => makeService({ repoIntelEnabled: false }).service;

  it('getBlastRadius skips the persistent path (falls to best-effort, empty when no clone)', async () => {
    // getBlastRadius is NOT hard-gated: it skips tryPersistentBlast but still
    // reads getRepoBasics for the ripgrep fallback. Pin that exact behaviour.
    const repo = { getRepoBasics: async () => null };
    const { service } = makeService({ repo, repoIntelEnabled: false });

    await expect(service.getBlastRadius('r1', ['a.ts'])).resolves.toEqual({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    });
  });

  it("getRepoMap → { text:'', tokens:0, cached:false, degraded:true, reason:'flag_off' }", async () => {
    await expect(off().getRepoMap('r1')).resolves.toEqual({
      text: '',
      tokens: 0,
      cached: false,
      degraded: true,
      reason: 'flag_off',
    });
  });

  it('getFileRank → []', async () => {
    await expect(off().getFileRank('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getSymbolsInFiles → []', async () => {
    await expect(off().getSymbolsInFiles('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getCallerSignatures → []', async () => {
    await expect(off().getCallerSignatures('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getUnresolvedReferences → []', async () => {
    await expect(off().getUnresolvedReferences('r1', ['a.ts'])).resolves.toEqual([]);
  });

  it('getTopFilesByRank and getConventionSamples → []', async () => {
    await expect(off().getTopFilesByRank('r1', 5)).resolves.toEqual([]);
    await expect(off().getConventionSamples('r1', 5)).resolves.toEqual([]);
  });

  it('getCriticalPaths → [] (both orderings)', async () => {
    await expect(off().getCriticalPaths('r1')).resolves.toEqual([]);
    await expect(off().getCriticalPaths('r1', { order: 'weighted' })).resolves.toEqual([]);
  });

  it('getWeightedRankedFiles → []', async () => {
    await expect(off().getWeightedRankedFiles('r1', 5)).resolves.toEqual([]);
  });

  it('getFileFacts → []', async () => {
    await expect(off().getFileFacts('r1', ['a.ts'])).resolves.toEqual([]);
  });
});

describe('RepoIntelService with repoIntelEnabled=true — repo IS consulted', () => {
  it('getFileRank forwards to the repository; empty input short-circuits before it', async () => {
    const asked: Array<{ id: string; paths: string[] }> = [];
    const repo = {
      getFileRankFor: async (id: string, paths: string[]) => {
        asked.push({ id, paths });
        return [{ path: 'a.ts', rank: 1, percentile: 99 }];
      },
    };
    const { service } = makeService({ repo });

    await expect(service.getFileRank('r1', [])).resolves.toEqual([]);
    expect(asked).toEqual([]);

    await expect(service.getFileRank('r1', ['a.ts'])).resolves.toEqual([
      { path: 'a.ts', rank: 1, percentile: 99 },
    ]);
    expect(asked).toEqual([{ id: 'r1', paths: ['a.ts'] }]);
  });

  it('getRepoMap with no index state → degraded no_data (not flag_off)', async () => {
    const repo = { tryGetIndexState: async () => null };
    const { service } = makeService({ repo });

    await expect(service.getRepoMap('r1')).resolves.toEqual({
      text: '',
      tokens: 0,
      cached: false,
      degraded: true,
      reason: 'no_data',
    });
  });

  it('getBlastRadius best-effort path reads symbols/references from the injected codeIndex', async () => {
    const refCalls: string[] = [];
    const codeIndex = {
      symbols: async () => [{ name: 'alpha', path: 'src/a.ts', kind: 'function', line: 1 }],
      references: async (_ref: unknown, name: string) => {
        refCalls.push(name);
        return [];
      },
    };
    // changedFiles non-empty + flag on → tryPersistentBlast first; make it miss.
    const repo = {
      getRepoBasics: async () => ({ ...BASICS, clonePath: '/mock/clone' }),
      tryGetIndexState: async () => null,
    };
    const { service } = makeService({ repo, codeIndex });

    const result = await service.getBlastRadius('r1', ['src/a.ts']);

    expect(refCalls).toEqual(['alpha']);
    expect(result.changedSymbols).toEqual([{ file: 'src/a.ts', name: 'alpha', kind: 'function' }]);
    expect(result.degraded).toBe(true);
  });
});
