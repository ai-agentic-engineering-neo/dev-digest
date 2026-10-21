/** onboarding service: hermetic (in-memory port fakes, MockLLMProvider, MockGitClient). */
import { describe, expect, it } from 'vitest';
import { STALE_RUN_MS } from '../src/modules/onboarding/constants.js';
import { DRAFT, REPO_ID, WS, makeFakes } from './helpers/onboarding.js';

const job = (runId: string) => ({ workspaceId: WS, repoId: REPO_ID, runId });

describe('OnboardingService.generate', () => {
  it('422 without a clone and no run is created (AC-25)', async () => {
    const { service, repo } = makeFakes({ clonePath: null });
    await expect(service.generate(WS, REPO_ID)).rejects.toMatchObject({ statusCode: 422 });
    expect(repo.runs).toHaveLength(0);
  });

  it('404 for an unknown repo (AC-7)', async () => {
    const { service } = makeFakes();
    await expect(service.generate(WS, 'nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns a young running run instead of starting another (AC-24, EC-5)', async () => {
    const { service, repo, queue } = makeFakes();
    const a = await service.generate(WS, REPO_ID);
    const b = await service.generate(WS, REPO_ID);
    expect(b.id).toBe(a.id);
    expect(repo.runs).toHaveLength(1);
    expect(queue).toHaveLength(1);
  });

  it('reaps a stale running run and starts a new one (AC-24, EC-6)', async () => {
    const { service, repo } = makeFakes();
    const first = await service.generate(WS, REPO_ID);
    repo.runs[0]!.started_at = new Date(Date.now() - STALE_RUN_MS - 1000).toISOString();
    const second = await service.generate(WS, REPO_ID);
    expect(second.id).not.toBe(first.id);
    expect(repo.runs[0]).toMatchObject({ status: 'failed' });
  });
});

describe('OnboardingService.runGeneration', () => {
  it('verifies paths and commands, stores the tour, records cost and a single model call', async () => {
    const { service, repo, llm } = makeFakes();
    const run = await service.generate(WS, REPO_ID);
    await service.runGeneration(job(run.id));
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    const tour = repo.stored!;
    const [arch, critical, runLocally, reading, tasks] = tour.sections;
    expect(arch.kind).toBe('architecture');
    expect(critical.items.map((i) => i.path)).toEqual(['src/server.ts']);
    // `pnpm install` is a verbatim README line, `pnpm dev` a script, `rm -rf /` is dropped.
    expect(runLocally.items.map((i) => i.command)).toEqual(['pnpm install', 'pnpm dev']);
    expect(reading.items.map((i) => i.path)).toEqual(['src/lib/redis.ts', 'src/server.ts']);
    expect(tasks.items).toHaveLength(1);
    expect(tour).toMatchObject({ provider: 'openai', model: 'gpt-test', tokens_in: 100, tokens_out: 50, cost_usd: 0.001, files_indexed: 120, limited: false });
    expect(repo.runs[0]).toMatchObject({ status: 'done', cost_usd: 0.001 });
  });

  it('limited path: no index flag reads the tree only and allows tree paths (AC-36, D2, D6)', async () => {
    const { service, repo, calls } = makeFakes({ repoIntelEnabled: false, indexedPaths: [] });
    const run = await service.generate(WS, REPO_ID);
    await service.runGeneration(job(run.id));
    expect(calls.top).toBe(0);
    expect(calls.rank).toBe(0);
    expect(repo.stored).toMatchObject({ limited: true, files_indexed: 4 });
    expect(repo.stored!.sections[1].items.map((i) => i.path)).toEqual(['src/server.ts']);
  });

  it('a partial index is limited too', async () => {
    const { service, repo } = makeFakes({ indexStatus: 'partial' });
    const run = await service.generate(WS, REPO_ID);
    await service.runGeneration(job(run.id));
    expect(repo.stored?.limited).toBe(true);
  });

  it('an empty section is stored empty with no fallback (AC-30)', async () => {
    const { service, repo } = makeFakes({ structured: { ...DRAFT, run_locally: { items: [{ command: 'make nothing', note: null }] } } });
    const run = await service.generate(WS, REPO_ID);
    await service.runGeneration(job(run.id));
    expect(repo.stored!.sections[2].items).toEqual([]);
  });

  it('an invalid model output fails the run with the contract message and keeps the stored tour (AC-33, AC-35)', async () => {
    const ok = makeFakes();
    const run1 = await ok.service.generate(WS, REPO_ID);
    await ok.service.runGeneration(job(run1.id));
    const kept = ok.repo.stored;
    expect(kept).not.toBeNull();

    const bad = makeFakes({ structured: { nope: true } });
    bad.repo.stored = kept;
    const run2 = await bad.service.generate(WS, REPO_ID);
    await bad.service.runGeneration(job(run2.id));
    expect(bad.repo.runs[0]).toMatchObject({ status: 'failed', error: 'The model returned an invalid tour' });
    expect(bad.repo.stored).toBe(kept);
  });

  it('a provider error is recorded with its own message (EC-8)', async () => {
    const f = makeFakes();
    f.deps.llm = async () => {
      throw new Error('No OPENAI key configured');
    };
    // rebuild a service on the modified deps
    const { OnboardingService } = await import('../src/modules/onboarding/service.js');
    const service = new OnboardingService(f.deps);
    const run = await service.generate(WS, REPO_ID);
    await service.runGeneration(job(run.id));
    expect(f.repo.runs[0]).toMatchObject({ status: 'failed', error: 'No OPENAI key configured' });
  });
});

describe('OnboardingService.view', () => {
  it('reads the DB only: no model and no git call (NFR-1) and no tour yet', async () => {
    const { service, llm, git } = makeFakes();
    expect(await service.view(WS, REPO_ID)).toEqual({ tour: null, run: null, stale: false });
    expect(llm.calls).toHaveLength(0);
    expect(git.listCalls).toHaveLength(0);
  });

  it('is stale when the repo was synced after generation (AC-38)', async () => {
    const f = makeFakes({ lastPolledAt: new Date(Date.now() + 60_000) });
    const run = await f.service.generate(WS, REPO_ID);
    await f.service.runGeneration(job(run.id));
    expect((await f.service.view(WS, REPO_ID)).stale).toBe(true);
    const fresh = makeFakes();
    const r = await fresh.service.generate(WS, REPO_ID);
    await fresh.service.runGeneration(job(r.id));
    expect((await fresh.service.view(WS, REPO_ID)).stale).toBe(false);
  });
});
