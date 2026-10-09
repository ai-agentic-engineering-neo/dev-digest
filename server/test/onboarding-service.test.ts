import { describe, it, expect } from 'vitest';
import { NotFoundError } from '../src/platform/errors.js';
import { OnboardingService } from '../src/modules/onboarding/service.js';
import type { RepoIntelIndexState, RepoIntelPort, RepoIntelWeightedFile } from '../src/modules/onboarding/ports.js';
import type { OnboardingRepository, OnboardingTourRow, UpsertOnboardingTourInput } from '../src/modules/onboarding/repository.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';

/**
 * specs/10-onboarding-generator.md — service-level behavior: exactly one
 * structured call per generation (AC-13), the in-flight guard (AC-20),
 * refusal on a non-generatable index / a failed import graph (AC-38, Q2),
 * the empty state (AC-37), and a failed generation preserving the previous
 * tour untouched (AC-24, AC-34, AC-36).
 */

class FakeOnboardingRepository {
  rows = new Map<string, OnboardingTourRow>();
  upsertCalls: UpsertOnboardingTourInput[] = [];

  async getTour(repoId: string): Promise<OnboardingTourRow | undefined> {
    return this.rows.get(repoId);
  }

  async upsertTour(input: UpsertOnboardingTourInput): Promise<void> {
    this.upsertCalls.push(input);
    this.rows.set(input.repoId, { ...input, generatedAt: new Date() });
  }
}

class FakeRepoIntel implements RepoIntelPort {
  constructor(
    private state: RepoIntelIndexState,
    private weighted: RepoIntelWeightedFile[] = [],
    private chains: string[][] = [],
  ) {}
  async getIndexState(): Promise<RepoIntelIndexState> {
    return this.state;
  }
  async getWeightedRankedFiles(_repoId: string, n: number): Promise<RepoIntelWeightedFile[]> {
    return this.weighted.slice(0, n);
  }
  async getCriticalPaths(): Promise<string[][]> {
    return this.chains;
  }
  async getFileFacts(): Promise<Array<{ file: string; endpoints: string[]; crons: string[] }>> {
    return [];
  }
}

/** Wraps a `MockLLMProvider` with an artificial delay on `completeStructured`
 *  so a concurrency test can deterministically observe "call A is still
 *  mid-generation" instead of racing on real (fast, variable) fs-timing. */
class DelayedLLM implements LLMProvider {
  readonly id = 'openai' as const;
  constructor(
    private inner: MockLLMProvider,
    private delayMs: number,
  ) {}
  async listModels() {
    return this.inner.listModels();
  }
  async complete(req: Parameters<LLMProvider['complete']>[0]) {
    return this.inner.complete(req);
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    return this.inner.completeStructured(req);
  }
  async embed(texts: string[]) {
    return this.inner.embed(texts);
  }
}

class ThrowingLLM implements LLMProvider {
  readonly id = 'openai' as const;
  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('not used');
  }
  async completeStructured<T>(_req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    throw new Error('schema-repair exhausted');
  }
  async embed(): Promise<never> {
    throw new Error('not used');
  }
}

const FULL_STATE: RepoIntelIndexState = {
  status: 'full',
  lastIndexedSha: 'sha-1',
  indexerVersion: 2,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  filesIndexed: 10,
  filesSkipped: 0,
  hotnessPrs: 2,
  hotnessWindowDays: 180,
};

const VALID_OUTPUT = {
  architecture: { title: 'Overview', body: 'text' },
  critical_paths: { title: 'Critical paths', entries: [] },
  run_locally: { title: 'Run locally', steps: [] },
  reading_path: { title: 'Reading path', entries: [{ path: 'src/a.ts', reason: 'start here' }] },
  first_tasks: { title: 'First tasks', tasks: [{ title: 'Task', body: 'body', files: ['src/a.ts'] }] },
};

const WEIGHTED = [{ path: 'src/a.ts', pagerank: 1, hotness: 0, weighted: 1, percentile: 90 }];

function repoLookup(clonePath: string | null = '/tmp/fixture') {
  return {
    getById: async () => ({ id: 'repo-1', owner: 'acme', name: 'demo', fullName: 'acme/demo', clonePath }),
  };
}

function buildService(opts: {
  state?: RepoIntelIndexState;
  weighted?: RepoIntelWeightedFile[];
  chains?: string[][];
  llm?: LLMProvider;
  clonePath?: string | null;
  repo?: FakeOnboardingRepository;
}) {
  const repo = opts.repo ?? new FakeOnboardingRepository();
  const repoIntel = new FakeRepoIntel(opts.state ?? FULL_STATE, opts.weighted ?? WEIGHTED, opts.chains ?? []);
  const llm = opts.llm ?? new MockLLMProvider('openai', { structured: VALID_OUTPUT });
  const service = new OnboardingService(
    repo as unknown as OnboardingRepository,
    repoLookup(opts.clonePath),
    repoIntel,
    async () => ({ provider: 'openai' as const, model: 'gpt-x' }),
    async () => llm,
    { count: (s: string) => Math.ceil(s.length / 4) },
    () => null,
    { info: () => {} },
  );
  return { service, repo, llm };
}

describe('OnboardingService.generate', () => {
  it('AC-13: exactly one completeStructured call, zero complete/embed', async () => {
    const { service, llm } = buildService({});
    const mock = llm as MockLLMProvider;
    const result = await service.generate('ws-1', 'repo-1');
    expect(result.status).toBe('generated');
    expect(mock.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(mock.calls.filter((c) => c.method === 'complete' || c.method === 'embed')).toHaveLength(0);
  });

  it('AC-20: two rapid generate calls make exactly one provider request; the second reports generating', async () => {
    const inner = new MockLLMProvider('openai', { structured: VALID_OUTPUT });
    const delayed = new DelayedLLM(inner, 30);
    const { service } = buildService({ llm: delayed });

    const firstPromise = service.generate('ws-1', 'repo-1');
    // Give call A time to pass its (fast, fs-based) prework and enter the
    // deliberately-slow `completeStructured` call, so B's check below
    // deterministically observes "still in flight" instead of racing on
    // real fs timing.
    await new Promise((r) => setTimeout(r, 10));
    const second = await service.generate('ws-1', 'repo-1');
    const first = await firstPromise;

    expect(second.status).toBe('generating');
    expect(first.status).toBe('generated');
    expect(inner.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
  });

  it('AC-38/Q2: refuses when the index status is degraded, zero provider calls', async () => {
    const { service, llm } = buildService({
      state: { ...FULL_STATE, status: 'degraded', reason: 'index_failed' },
    });
    const mock = llm as MockLLMProvider;
    const result = await service.generate('ws-1', 'repo-1');
    expect(result.status).toBe('refused');
    expect(mock.calls).toHaveLength(0);
  });

  it('AC-38/Q2: refuses on a graphFailed partial index, naming the reason, zero provider calls', async () => {
    const { service, llm } = buildService({
      state: { ...FULL_STATE, status: 'partial', graphFailed: 'dep-cruise crashed' },
    });
    const mock = llm as MockLLMProvider;
    const result = await service.generate('ws-1', 'repo-1');
    expect(result.status).toBe('refused');
    expect(result.reason).toContain('import graph');
    expect(mock.calls).toHaveLength(0);
  });

  it('AC-37/AC-38: no checkout and no index data at all → empty state, zero provider calls', async () => {
    const { service, llm } = buildService({
      clonePath: null,
      state: { ...FULL_STATE, filesIndexed: 0 },
      weighted: [],
    });
    const mock = llm as MockLLMProvider;
    const result = await service.generate('ws-1', 'repo-1');
    expect(result.status).toBe('empty');
    expect(mock.calls).toHaveLength(0);
  });

  it('AC-24/AC-34/AC-36: a failed generation writes nothing and returns the previous tour unchanged', async () => {
    const repo = new FakeOnboardingRepository();
    const previousTour = {
      repoId: 'repo-1',
      json: { sections: [] },
      generatedAt: new Date('2025-01-01'),
      indexSha: 'sha-old',
      indexerVersion: 2,
      indexUpdatedAt: new Date('2025-01-01'),
      filesIndexed: 5,
      filesExcluded: 0,
      prsWeighted: 1,
      provider: 'openai',
      model: 'gpt-old',
      attempts: 1,
      tokensIn: 10,
      tokensOut: 10,
      costUsd: 0.001,
    };
    repo.rows.set('repo-1', previousTour);

    const { service } = buildService({ repo, llm: new ThrowingLLM() });
    const result = await service.generate('ws-1', 'repo-1');

    expect(result.status).toBe('failed');
    expect(result.tour).toEqual(previousTour.json);
    expect(repo.upsertCalls).toHaveLength(0); // AC-36: nothing written
  });

  it('AC-38/Q2: refuses when the index is generatable but has zero ranked files — distinct from the AC-37 empty-state branch, which additionally requires no checkout at all', async () => {
    // `weighted: []` alone (clonePath still set, FULL_STATE.filesIndexed > 0)
    // must NOT fall into the "empty" branch (that needs `!clonePath` too) —
    // it should reach `refusalReason`'s own zero-ranked-files check.
    const { service, llm } = buildService({ weighted: [] });
    const mock = llm as MockLLMProvider;
    const result = await service.generate('ws-1', 'repo-1');
    expect(result.status).toBe('refused');
    expect(result.reason).toContain('No ranked files');
    expect(mock.calls).toHaveLength(0);
  });

  it('AC-49: generate() 404s for a repo outside the workspace before any provider call (workspace scope is checked first)', async () => {
    const repoLookupMissing = { getById: async () => undefined };
    const repo = new FakeOnboardingRepository();
    const repoIntel = new FakeRepoIntel(FULL_STATE, WEIGHTED, []);
    const llm = new MockLLMProvider('openai', { structured: VALID_OUTPUT });
    const service = new OnboardingService(
      repo as unknown as OnboardingRepository,
      repoLookupMissing,
      repoIntel,
      async () => ({ provider: 'openai' as const, model: 'gpt-x' }),
      async () => llm,
      { count: (s: string) => Math.ceil(s.length / 4) },
      () => null,
      { info: () => {} },
    );
    await expect(service.generate('ws-other', 'repo-1')).rejects.toThrow(NotFoundError);
    expect(llm.calls).toHaveLength(0);
  });
});

describe('OnboardingService.getPage', () => {
  it('returns undefined for a repo outside the workspace (AC-49)', async () => {
    const repoLookupMissing = { getById: async () => undefined };
    const repo = new FakeOnboardingRepository();
    const repoIntel = new FakeRepoIntel(FULL_STATE, WEIGHTED, []);
    const scoped = new OnboardingService(
      repo as unknown as OnboardingRepository,
      repoLookupMissing,
      repoIntel,
      async () => ({ provider: 'openai' as const, model: 'gpt-x' }),
      async () => new MockLLMProvider('openai', { structured: VALID_OUTPUT }),
      { count: (s: string) => Math.ceil(s.length / 4) },
      () => null,
      { info: () => {} },
    );
    await expect(scoped.getPage('ws-1', 'repo-x')).resolves.toBeUndefined();
  });

  it('AC-19/AC-22: reports `skeleton` with no stored tour, and never calls the provider', async () => {
    const { service, llm } = buildService({});
    const mock = llm as MockLLMProvider;
    const page = await service.getPage('ws-1', 'repo-1');
    expect(page?.status).toBe('skeleton');
    expect(mock.calls).toHaveLength(0);
  });

  it('AC-23: a tour whose index_sha no longer matches the current index is marked stale', async () => {
    const repo = new FakeOnboardingRepository();
    repo.rows.set('repo-1', {
      repoId: 'repo-1',
      json: { sections: [] },
      generatedAt: new Date(),
      indexSha: 'sha-old',
      indexerVersion: 2,
      indexUpdatedAt: new Date('2025-01-01'),
      filesIndexed: 5,
      filesExcluded: 0,
      prsWeighted: 1,
      provider: 'openai',
      model: 'gpt-old',
      attempts: 1,
      tokensIn: 10,
      tokensOut: 10,
      costUsd: 0.001,
    });
    const { service } = buildService({ repo, state: { ...FULL_STATE, lastIndexedSha: 'sha-new' } });
    const page = await service.getPage('ws-1', 'repo-1');
    expect(page?.status).toBe('stale');
    expect(page?.stale).toBe(true);
  });

  it('AC-23: a tour whose indexerVersion no longer matches the current index is marked stale, even with the sha unchanged', async () => {
    const repo = new FakeOnboardingRepository();
    repo.rows.set('repo-1', {
      repoId: 'repo-1',
      json: { sections: [] },
      generatedAt: new Date(),
      indexSha: FULL_STATE.lastIndexedSha, // unchanged
      indexerVersion: 1, // FULL_STATE below is indexerVersion 2 — the ONLY mismatch
      indexUpdatedAt: new Date('2025-01-01'),
      filesIndexed: 5,
      filesExcluded: 0,
      prsWeighted: 1,
      provider: 'openai',
      model: 'gpt-old',
      attempts: 1,
      tokensIn: 10,
      tokensOut: 10,
      costUsd: 0.001,
    });
    const { service } = buildService({ repo, state: FULL_STATE });
    const page = await service.getPage('ws-1', 'repo-1');
    expect(page?.status).toBe('stale');
  });

  it('AC-20: a concurrent GET also reports generating while a generation is in flight (service.ts\'s own comment on this branch)', async () => {
    const inner = new MockLLMProvider('openai', { structured: VALID_OUTPUT });
    const delayed = new DelayedLLM(inner, 30);
    const { service } = buildService({ llm: delayed });

    const genPromise = service.generate('ws-1', 'repo-1');
    await new Promise((r) => setTimeout(r, 10));
    const page = await service.getPage('ws-1', 'repo-1');
    await genPromise;

    expect(page?.status).toBe('generating');
  });
});
