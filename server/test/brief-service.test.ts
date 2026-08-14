import { describe, it, expect } from 'vitest';
import { BriefService } from '../src/modules/brief/service.js';
import type { BriefRepository, BriefRow, UpsertBriefInput, BriefPullRow, BriefPrFileRow, BriefRepoRow } from '../src/modules/brief/repository.js';
import type { RepoIntelIndexState, RepoIntelPort } from '../src/modules/brief/ports.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';

/**
 * specs/11-why-risk-brief.md — service-level behavior: exactly one
 * structured call (AC-10), the cache check (AC-24/AC-26), the in-flight
 * guard (AC-27, `server/LEARNINGS.md:84-109`'s delayed-stub recipe — not
 * `Promise.all`), the empty-files refusal (AC-31), a failed generation
 * leaving the previous brief untouched (AC-28/AC-33), and workspace scoping
 * (AC-44).
 */

const PULL: BriefPullRow = {
  id: 'pr-1',
  repoId: 'repo-1',
  number: 42,
  title: 'Fix rate limiting',
  body: null,
  headSha: 'sha-head',
  base: 'main',
  additions: 10,
  deletions: 2,
  filesCount: 1,
  intentSummary: null,
  intentInScope: null,
  intentOutOfScope: null,
  intentContextGaps: null,
  intentSignals: null,
  intentResolvedAt: null,
};

const REPO_ROW: BriefRepoRow = { id: 'repo-1', owner: 'acme', name: 'demo', fullName: 'acme/demo', clonePath: null };
const FILES: BriefPrFileRow[] = [{ path: 'src/a.ts', additions: 10, deletions: 2, patch: '@@ -1,2 +1,2 @@\n-x\n+y' }];

const VALID_OUTPUT = {
  what: 'Adds rate limiting.',
  why: 'Prevents abuse.',
  risk_level: 'medium',
  risks: [
    {
      kind: 'performance',
      title: 'Hot path',
      explanation: 'Touches the handler.',
      severity: 'medium',
      file_refs: [{ file: 'src/a.ts', line: null }],
    },
  ],
  review_focus: [{ file: 'src/a.ts', line: null, reason: 'Core change.' }],
};

class FakeBriefRepository {
  pulls = new Map<string, BriefPullRow>([['pr-1', PULL]]);
  repos = new Map<string, BriefRepoRow>([['repo-1', REPO_ROW]]);
  files = new Map<string, BriefPrFileRow[]>([['pr-1', FILES]]);
  rows = new Map<string, BriefRow>();
  upsertCalls: UpsertBriefInput[] = [];

  async getPull(workspaceId: string, prId: string): Promise<BriefPullRow | undefined> {
    if (workspaceId !== 'ws-1') return undefined; // AC-44
    return this.pulls.get(prId);
  }
  async getRepo(repoId: string): Promise<BriefRepoRow | undefined> {
    return this.repos.get(repoId);
  }
  async getPrFiles(prId: string): Promise<BriefPrFileRow[]> {
    return this.files.get(prId) ?? [];
  }
  async getBrief(prId: string): Promise<BriefRow | undefined> {
    return this.rows.get(prId);
  }
  async upsertBrief(input: UpsertBriefInput): Promise<void> {
    this.upsertCalls.push(input);
    this.rows.set(input.prId, { ...input, generatedAt: new Date() });
  }
}

const FULL_STATE: RepoIntelIndexState = {
  status: 'full',
  lastIndexedSha: 'idx-sha',
  indexerVersion: 1,
  updatedAt: new Date('2026-01-01'),
};

class FakeRepoIntel implements RepoIntelPort {
  constructor(private state: RepoIntelIndexState = FULL_STATE) {}
  async getBlastRadius() {
    return { changedSymbols: [], callers: [], impactedEndpoints: [] };
  }
  async getIndexState() {
    return this.state;
  }
}

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
    throw new Error('provider failed');
  }
  async embed(): Promise<never> {
    throw new Error('not used');
  }
}

function buildService(opts: { repo?: FakeBriefRepository; llm?: LLMProvider; state?: RepoIntelIndexState } = {}) {
  const repo = opts.repo ?? new FakeBriefRepository();
  const llm = opts.llm ?? new MockLLMProvider('openai', { structured: VALID_OUTPUT });
  const service = new BriefService(
    repo as unknown as BriefRepository,
    new FakeRepoIntel(opts.state),
    async () => ({ provider: 'openai' as const, model: 'gpt-x' }),
    async () => llm,
    async () => {
      throw new Error('no github client configured');
    },
    async () => null,
    { count: (s: string) => Math.ceil(s.length / 4) },
    () => null,
    { info: () => {} },
  );
  return { service, repo, llm };
}

describe('BriefService.generate', () => {
  it('AC-10: exactly one completeStructured call, zero complete/embed', async () => {
    const { service, llm } = buildService();
    const mock = llm as MockLLMProvider;
    const result = await service.generate('ws-1', 'pr-1', false);
    expect(result.status).toBe('generated');
    expect(mock.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(mock.calls.filter((c) => c.method === 'complete' || c.method === 'embed')).toHaveLength(0);
  });

  it('AC-31: an empty pr_files list refuses, zero provider calls', async () => {
    const repo = new FakeBriefRepository();
    repo.files.set('pr-1', []);
    const { service, llm } = buildService({ repo });
    const mock = llm as MockLLMProvider;
    const result = await service.generate('ws-1', 'pr-1', false);
    expect(result.status).toBe('refused');
    expect(mock.calls).toHaveLength(0);
  });

  it('AC-24: a second generate call with no intervening push serves the cache, zero further provider calls', async () => {
    const { service, llm } = buildService();
    const mock = llm as MockLLMProvider;
    await service.generate('ws-1', 'pr-1', false);
    const second = await service.generate('ws-1', 'pr-1', false);
    expect(second.status).toBe('generated');
    expect(mock.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1); // still 1
  });

  it('AC-26: an explicit regenerate makes a fresh call even against a matching cached state', async () => {
    const { service, llm } = buildService();
    const mock = llm as MockLLMProvider;
    await service.generate('ws-1', 'pr-1', false);
    await service.generate('ws-1', 'pr-1', true);
    expect(mock.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(2);
  });

  it('AC-27: two rapid generate calls make exactly one provider request; the second observes generating (delayed-stub recipe)', async () => {
    const inner = new MockLLMProvider('openai', { structured: VALID_OUTPUT });
    const delayed = new DelayedLLM(inner, 30);
    const { service } = buildService({ llm: delayed });

    const firstPromise = service.generate('ws-1', 'pr-1', false);
    await new Promise((r) => setTimeout(r, 10));
    const second = await service.generate('ws-1', 'pr-1', false);
    const first = await firstPromise;

    expect(second.status).toBe('generating');
    expect(first.status).toBe('generated');
    expect(inner.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
  });

  it('AC-27: a concurrent GET also reports generating while a generation is in flight', async () => {
    const inner = new MockLLMProvider('openai', { structured: VALID_OUTPUT });
    const delayed = new DelayedLLM(inner, 30);
    const { service } = buildService({ llm: delayed });

    const genPromise = service.generate('ws-1', 'pr-1', false);
    await new Promise((r) => setTimeout(r, 10));
    const page = await service.getPage('ws-1', 'pr-1');
    await genPromise;

    expect(page?.status).toBe('generating');
  });

  it('AC-28/AC-33: a failing generation writes nothing and returns the previous brief intact', async () => {
    const repo = new FakeBriefRepository();
    const previous: BriefRow = {
      prId: 'pr-1',
      json: { what: 'old', why: 'old', risk_level: 'low', risks: [], review_focus: [] },
      generatedAt: new Date('2025-01-01'),
      headSha: 'sha-head',
      indexSha: 'idx-old',
      indexStatus: 'full',
      indexerVersion: 1,
      intentResolvedAt: null,
      provider: 'openai',
      model: 'gpt-old',
      attempts: 1,
      tokensIn: 10,
      tokensOut: 10,
      costUsd: 0.001,
      droppedInputs: 0,
    };
    repo.rows.set('pr-1', previous);

    const { service } = buildService({ repo, llm: new ThrowingLLM() });
    // `regenerate: true` forces past the AC-24 cache-hit branch (the stored
    // brief's head sha matches PULL's) so the throwing LLM actually gets
    // invoked — this test is about the failure path, not the cache path.
    const result = await service.generate('ws-1', 'pr-1', true);

    expect(result.status).toBe('failed');
    expect(result.brief).toEqual(previous.json);
    expect(repo.upsertCalls).toHaveLength(0); // nothing written
  });

  it('AC-44: a PR in another workspace 404s before any pr_brief row is read', async () => {
    const { service } = buildService();
    await expect(service.generate('ws-other', 'pr-1', false)).rejects.toThrow();
  });
});

describe('BriefService.getPage', () => {
  it('returns undefined for a PR outside the workspace (AC-44)', async () => {
    const { service } = buildService();
    await expect(service.getPage('ws-other', 'pr-1')).resolves.toBeUndefined();
  });

  it('AC-23: reports `none` with no stored brief, and never calls the provider', async () => {
    const { service, llm } = buildService();
    const mock = llm as MockLLMProvider;
    const page = await service.getPage('ws-1', 'pr-1');
    expect(page?.status).toBe('none');
    expect(mock.calls).toHaveLength(0);
  });

  it('AC-25: a stored brief whose head sha no longer matches is reported earlier_state, naming the sha', async () => {
    const repo = new FakeBriefRepository();
    repo.rows.set('pr-1', {
      prId: 'pr-1',
      json: { what: 'x', why: 'x', risk_level: 'low', risks: [], review_focus: [] },
      generatedAt: new Date(),
      headSha: 'sha-old',
      indexSha: 'idx',
      indexStatus: 'full',
      indexerVersion: 1,
      intentResolvedAt: null,
      provider: 'openai',
      model: 'gpt-x',
      attempts: 1,
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0,
      droppedInputs: 0,
    });
    const { service } = buildService({ repo });
    const page = await service.getPage('ws-1', 'pr-1');
    expect(page?.status).toBe('earlier_state');
    expect(page?.stale_markers[0]).toContain('sha-old');
  });

  it('AC-30: same head sha but the index moved is reported possibly_stale, naming what moved', async () => {
    const repo = new FakeBriefRepository();
    repo.rows.set('pr-1', {
      prId: 'pr-1',
      json: { what: 'x', why: 'x', risk_level: 'low', risks: [], review_focus: [] },
      generatedAt: new Date(),
      headSha: 'sha-head',
      indexSha: 'idx-old',
      indexStatus: 'full',
      indexerVersion: 1,
      intentResolvedAt: null,
      provider: 'openai',
      model: 'gpt-x',
      attempts: 1,
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0,
      droppedInputs: 0,
    });
    const { service } = buildService({ repo, state: { ...FULL_STATE, lastIndexedSha: 'idx-new' } });
    const page = await service.getPage('ws-1', 'pr-1');
    expect(page?.status).toBe('possibly_stale');
    expect(page?.stale_markers).toContain('repository index');
  });

  it('a stored brief matching the current head sha and index reports generated', async () => {
    const repo = new FakeBriefRepository();
    repo.rows.set('pr-1', {
      prId: 'pr-1',
      json: { what: 'x', why: 'x', risk_level: 'low', risks: [], review_focus: [] },
      generatedAt: new Date(),
      headSha: 'sha-head',
      indexSha: 'idx-sha',
      indexStatus: 'full',
      indexerVersion: 1,
      intentResolvedAt: null,
      provider: 'openai',
      model: 'gpt-x',
      attempts: 1,
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0,
      droppedInputs: 0,
    });
    const { service } = buildService({ repo });
    const page = await service.getPage('ws-1', 'pr-1');
    expect(page?.status).toBe('generated');
    expect(page?.stale_markers).toEqual([]);
  });
});
