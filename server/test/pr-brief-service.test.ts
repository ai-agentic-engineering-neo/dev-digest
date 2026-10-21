/** pr-brief service: hermetic (in-memory port fakes, MockLLMProvider). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigError } from '../src/platform/errors.js';
import { BRIEF_CALL_TIMEOUT_MS, INVALID_BRIEF_ERROR, STALE_RUN_MS } from '../src/modules/pr-brief/constants.js';
import { PR_ID, WS, makeFakes } from './helpers/pr-brief.js';

const job = (runId: string) => ({ workspaceId: WS, prId: PR_ID, runId, headSha: 'h1', sourceReviewId: null });
const structuredCalls = (llm: { calls: { method: string }[] }) => llm.calls.filter((c) => c.method === 'completeStructured');

afterEach(() => vi.useRealTimers());

describe('PrBriefService.generate', () => {
  it('404 for an unknown PR; young running run is returned; stale one is failed and replaced', async () => {
    const { service, repo, queue } = makeFakes();
    await expect(service.generate(WS, 'nope')).rejects.toMatchObject({ statusCode: 404 });
    const a = await service.generate(WS, PR_ID);
    const b = await service.generate(WS, PR_ID);
    expect(b.run_id).toBe(a.run_id);
    expect(queue).toHaveLength(1);
    repo.runs[0]!.ran_at = new Date(Date.now() - STALE_RUN_MS - 1000).toISOString();
    const c = await service.generate(WS, PR_ID);
    expect(c.run_id).not.toBe(a.run_id);
    expect(repo.runs[0]).toMatchObject({ status: 'failed' });
    expect(queue[1]).toMatchObject({ headSha: 'h1', sourceReviewId: null });
  });
});

describe('PrBriefService.runGeneration', () => {
  it('makes exactly one structured call with maxRetries 0, verifies refs, one transaction, one trace tool call', async () => {
    const { service, repo, llm } = makeFakes();
    const run = await service.generate(WS, PR_ID);
    await service.runGeneration(job(run.run_id));
    const calls = structuredCalls(llm);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.req).toMatchObject({ maxRetries: 0, schemaName: 'PrBriefDraft' });
    expect(repo.stored!.review_focus).toEqual([
      { path: 'src/a.ts', line: 10, reason: 'check' },
      { path: 'src/a.ts', line: null, reason: 'outside' },
    ]);
    expect(repo.stored!.risks).toHaveLength(1);
    expect(repo.stored).toMatchObject({ provider: 'openrouter', model: 'deepseek-test', tokens_in: 100, files_total: 1, files_included: 1 });
    expect(repo.runs[0]).toMatchObject({ status: 'done' });
    expect(repo.traces.get(run.run_id)!.tool_calls.map((c) => c.tool)).toEqual(['generate_brief']);
  });

  it('invalid output fails the run with no second call and keeps the stored brief', async () => {
    let calls = 0;
    const { service, repo } = makeFakes({
      llm: {
        completeStructured: async () => {
          calls++;
          throw new Error('OpenRouter structured output failed schema validation for PrBriefDraft: - risks.0.title: Required');
        },
      },
    });
    const run = await service.generate(WS, PR_ID);
    await expect(service.runGeneration(job(run.run_id))).resolves.toBeUndefined();
    expect(repo.runs[0]).toMatchObject({ status: 'failed' });
    expect(repo.runs[0]!.error).toBe(`${INVALID_BRIEF_ERROR}: OpenRouter structured output failed schema validation for PrBriefDraft: - risks.0.title: Required`);
    expect(repo.stored).toBeNull();
    expect(repo.traces.has(run.run_id)).toBe(true);
    expect(calls).toBe(1);
  });

  it('a loosely typed draft is normalised and stored instead of failing the run', async () => {
    const { service, repo } = makeFakes({
      structured: {
        summary: 's',
        risks: [{ kind: 'Security', title: 't', explanation: 'e', severity: 'HIGH', file_refs: ['src/a.ts:10', 7] }],
        review_focus: [{ path: 'src/a.ts', line: '10', reason: 'r' }],
      },
    });
    const run = await service.generate(WS, PR_ID);
    await service.runGeneration(job(run.run_id));
    expect(repo.runs[0]).toMatchObject({ status: 'done' });
    expect(repo.stored!.risks[0]).toMatchObject({ kind: 'other', severity: 'high', file_refs: ['src/a.ts:10'] });
    expect(repo.stored!.review_focus).toEqual([{ path: 'src/a.ts', line: 10, reason: 'r' }]);
  });

  it('a missing key names the provider', async () => {
    const { service, repo } = makeFakes({ llmFactoryThrows: new ConfigError('OPENROUTER_API_KEY is not configured') });
    const run = await service.generate(WS, PR_ID);
    await service.runGeneration(job(run.run_id));
    expect(repo.runs[0]!.error).toBe('No API key configured for openrouter');
  });

  it('skips blast when disabled, degraded or throwing; never derives intent', async () => {
    for (const opts of [{ repoIntelEnabled: false }, { blastDegraded: true }, { blastThrows: true }]) {
      const { service, repo, calls } = makeFakes(opts);
      const run = await service.generate(WS, PR_ID);
      await service.runGeneration(job(run.run_id));
      expect(repo.runs[0]).toMatchObject({ status: 'done' });
      expect(calls.blast).toBe(opts.repoIntelEnabled === false ? 0 : 1);
      expect(repo.traces.get(run.run_id)!.prompt_assembly.user).not.toContain('blast-radius');
    }
  });

  it('a never-resolving model call ends failed at the deadline', async () => {
    vi.useFakeTimers();
    const { service, repo } = makeFakes({ llm: { completeStructured: () => new Promise(() => {}) } });
    const run = await service.generate(WS, PR_ID);
    const done = service.runGeneration(job(run.run_id));
    await vi.advanceTimersByTimeAsync(BRIEF_CALL_TIMEOUT_MS + 10);
    await done;
    expect(repo.runs[0]).toMatchObject({ status: 'failed' });
    expect(repo.runs[0]!.error).toMatch(/timed out/);
  });

  it('a PR removed before the job runs fails the run silently', async () => {
    const { service, repo } = makeFakes();
    const run = await service.generate(WS, PR_ID);
    repo.pull = undefined;
    await expect(service.runGeneration(job(run.run_id))).resolves.toBeUndefined();
    expect(repo.runs[0]).toMatchObject({ status: 'failed', error: 'Pull request was removed' });
  });
});

describe('PrBriefService.view', () => {
  it('reads the database only and reports stale after a head change', async () => {
    const { service, repo, llm } = makeFakes();
    expect(await service.view(WS, PR_ID)).toEqual({ brief: null, review: null, run: null, stale: false });
    const run = await service.generate(WS, PR_ID);
    await service.runGeneration(job(run.run_id));
    expect((await service.view(WS, PR_ID)).stale).toBe(false);
    repo.pull!.headSha = 'h2';
    expect((await service.view(WS, PR_ID)).stale).toBe(true);
    expect(structuredCalls(llm)).toHaveLength(1);
  });
});
