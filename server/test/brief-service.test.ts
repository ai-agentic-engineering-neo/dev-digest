import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '@devdigest/shared';
import { OpenRouterProvider } from '@devdigest/reviewer-core';

// Fake OpenAI SDK client used only by the "SDK boundary" describe at the bottom; every other test
// in this file uses MockLLMProvider and never constructs the SDK.
const sdkCreate = vi.hoisted(() => vi.fn());
// reviewer-core resolves its OWN openai copy (not server/node_modules), so mock that path.
vi.mock('../../reviewer-core/node_modules/openai', () => ({
  default: class {
    chat = { completions: { create: sdkCreate } };
  },
}));
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { BriefService } from '../src/modules/brief/service.js';
import {
  BriefGenerationError,
  BriefModelNotConfiguredError,
  BriefNoChangedFilesError,
  BriefTooLargeError,
  classifyGenerationError,
} from '../src/modules/brief/errors.js';
import type {
  BriefDeps,
  BriefFileRow,
  BriefPullContext,
  BriefRepositoryPort,
} from '../src/modules/brief/ports.js';
import type { StoredBrief } from '../src/modules/brief/domain/types.js';
import { ConfigError, NotFoundError } from '../src/platform/errors.js';

const CTX: BriefPullContext = {
  prId: 'pr1',
  repoId: 'r1',
  number: 7,
  title: 'Add refresh',
  body: 'body',
  headSha: 'b',
  fullName: 'o/r',
};
const PATCH = [
  '@@ -1,4 +1,6 @@ const SECRET_CTX = 1',
  "+const BODY_ADD = 'x'",
  '-const BODY_DEL = 1',
  ' const BODY_CTX = 2',
].join('\n');
const FILES: BriefFileRow[] = [{ path: 'a.ts', additions: 1, deletions: 1, patch: PATCH }];
const REPLY = {
  summary: 'sum',
  risks: [{ kind: 'auth', title: 't', explanation: 'e', severity: 'high', file_refs: ['a.ts:2'] }],
  review_focus: [{ file: 'a.ts', line: 2, reason: 'r' }],
};

function makeRepo(over: { files?: BriefFileRow[]; ctx?: BriefPullContext | undefined; override?: never } = {}) {
  let stored: StoredBrief | undefined;
  const save = vi.fn(async (_id: string, b: StoredBrief) => {
    stored = b;
  });
  const repo: BriefRepositoryPort = {
    getPullContext: async () => ('ctx' in over ? over.ctx : CTX),
    listChangedFiles: async () => over.files ?? FILES,
    countChangedFiles: async () => (over.files ?? FILES).length,
    get: async () => stored,
    save,
    featureModelOverride: async () => undefined,
  };
  return { repo, save, setStored: (b: StoredBrief) => (stored = b) };
}

function makeService(
  opts: {
    llm?: LLMProvider;
    repo?: BriefRepositoryPort;
    body?: string;
    over?: Partial<BriefDeps>;
    clock?: () => Date;
  } = {},
) {
  const llm = (opts.llm ?? new MockLLMProvider('openai', { structuredBySchema: { PrRiskBrief: REPLY } })) as MockLLMProvider;
  const { repo, save, setStored } = makeRepo();
  const briefLlm = vi.fn(async () => llm);
  const deps: BriefDeps = {
    briefRepo: opts.repo ?? repo,
    intent: { get: async () => null },
    blast: { forPull: async () => ({ degraded: true, reason: 'index_failed' }) as never },
    projectContext: { forBrief: async () => ({ included: [] }) },
    briefLlm,
    ...opts.over,
  };
  const svc = new BriefService(deps, opts.clock ?? (() => new Date('2026-01-01T00:00:00Z')));
  return { svc, llm, briefLlm, save, setStored, deps };
}

describe('BriefService', () => {
  it('get with no brief makes no model call (AC-1/AC-10)', async () => {
    const { svc, briefLlm, llm } = makeService();
    const r = await svc.get('w', 'pr1');
    expect(r.brief).toBeNull();
    expect(r.generating).toBe(false);
    expect(r.model).toEqual({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' });
    expect(briefLlm).not.toHaveBeenCalled();
    expect(llm.calls).toHaveLength(0);
  });

  it('generate makes exactly one call with caps and no patch code (AC-3)', async () => {
    const { svc, llm, briefLlm, save } = makeService();
    const r = await svc.generate('w', 'pr1');
    expect(briefLlm).toHaveBeenCalledWith('openrouter');
    expect(llm.calls).toHaveLength(1);
    const req = llm.calls[0]!.req as {
      maxRetries: number;
      timeoutMs: number;
      maxTokens: number;
      schemaName: string;
      model: string;
      messages: { content: string }[];
    };
    expect(req).toMatchObject({ maxRetries: 1, timeoutMs: 60000, maxTokens: 2000, schemaName: 'PrRiskBrief' });
    expect(req.model).toBe('deepseek/deepseek-v4-flash');
    const text = req.messages.map((m) => m.content).join('\n');
    expect(text).toContain('@@ -1,4 +1,6 @@');
    for (const s of ['SECRET_CTX', 'BODY_ADD', 'BODY_DEL', 'BODY_CTX']) expect(text).not.toContain(s);
    expect(save).toHaveBeenCalledTimes(1);
    expect(r.generating).toBe(false);
    expect(r.brief?.missing_inputs.map((m) => m.input)).toEqual(['intent', 'blast', 'smart_diff_roles']);
    expect(r.brief?.usage).toMatchObject({ provider: 'openrouter', tokens_in: 100, tokens_out: 50, cost_usd: 0.001 });
    const again = await svc.get('w', 'pr1');
    expect(again.brief).toEqual(r.brief);
    expect(llm.calls).toHaveLength(1);
  });

  it('too large PR gives brief_too_large before resolving a provider (AC-20, D14)', async () => {
    const { repo } = makeRepo();
    repo.getPullContext = async () => ({ ...CTX, body: 'x'.repeat(40_000) });
    const { svc, briefLlm, save } = makeService({ repo });
    briefLlm.mockRejectedValue(new ConfigError('no key'));
    const err = await svc.generate('w', 'pr1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BriefTooLargeError);
    expect((err as BriefTooLargeError).details).toMatchObject({ limit: 8000 });
    expect(((err as BriefTooLargeError).details as { tokens: number }).tokens).toBeGreaterThan(8000);
    expect(briefLlm).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('ConfigError from briefLlm maps to brief_model_not_configured (AC-12)', async () => {
    const { svc, briefLlm, llm } = makeService();
    briefLlm.mockRejectedValue(new ConfigError('no key'));
    await expect(svc.generate('w', 'pr1')).rejects.toBeInstanceOf(BriefModelNotConfiguredError);
    expect(llm.calls).toHaveLength(0);
  });

  it('failures classify and save nothing (AC-12)', async () => {
    const cases: [Error, string][] = [
      [Object.assign(new Error('x'), { name: 'TimeoutError' }), 'timeout'],
      [new Error('failed schema validation'), 'invalid_reply'],
      [Object.assign(new Error('boom'), { status: 500 }), 'provider_error'],
    ];
    for (const [error, reason] of cases) {
      const llm = new MockLLMProvider();
      llm.completeStructured = async () => {
        throw error;
      };
      const { svc, save } = makeService({ llm });
      const err = await svc.generate('w', 'pr1').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BriefGenerationError);
      expect((err as BriefGenerationError).details).toEqual({ reason });
      expect(save).not.toHaveBeenCalled();
      expect(classifyGenerationError(error)).toBe(reason);
    }
  });

  it('a provider error message never reaches the error; it goes to the server log only', async () => {
    const llm = new MockLLMProvider();
    llm.completeStructured = async () => {
      throw Object.assign(new Error('401 Unauthorized: invalid key sk-test-secret'), { status: 401 });
    };
    const { svc } = makeService({ llm });
    const logger = { info: vi.fn(), warn: vi.fn() };
    const err = await svc.generate('w', 'pr1', logger).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BriefGenerationError);
    const e = err as BriefGenerationError;
    expect(e.message).not.toContain('sk-test-secret');
    expect(JSON.stringify({ code: e.code, message: e.message, details: e.details })).not.toContain('sk-test-secret');
    expect(e.details).toEqual({ reason: 'provider_error' });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]![0]).toMatchObject({ outcome: 'failed', providerError: expect.stringContaining('sk-test-secret') });
  });

  it('unknown PR (other workspace) is 404 and calls nothing (AC-13)', async () => {
    const { repo } = makeRepo({ ctx: undefined });
    const { svc, llm, briefLlm } = makeService({ repo });
    await expect(svc.get('w', 'pr1')).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.generate('w', 'pr1')).rejects.toBeInstanceOf(NotFoundError);
    expect(briefLlm).not.toHaveBeenCalled();
    expect(llm.calls).toHaveLength(0);
  });

  it('no changed files (AC-16)', async () => {
    const { repo } = makeRepo({ files: [] });
    const { svc, briefLlm } = makeService({ repo });
    await expect(svc.generate('w', 'pr1')).rejects.toBeInstanceOf(BriefNoChangedFilesError);
    expect(briefLlm).not.toHaveBeenCalled();
  });

  it('override model is used (AC-17)', async () => {
    const { repo } = makeRepo();
    repo.featureModelOverride = async () => ({ provider: 'anthropic', model: 'claude-x' });
    const { svc, briefLlm, llm } = makeService({ repo });
    await svc.generate('w', 'pr1');
    expect(briefLlm).toHaveBeenCalledWith('anthropic');
    expect((llm.calls[0]!.req as { model: string }).model).toBe('claude-x');
  });

  it('outdated when stored head_sha differs (AC-18)', async () => {
    const { svc, setStored, llm } = makeService();
    await svc.generate('w', 'pr1');
    const stored = (await svc.get('w', 'pr1')).brief!;
    setStored({ ...stored, head_sha: 'a' });
    expect((await svc.get('w', 'pr1')).outdated).toBe(true);
    expect(llm.calls).toHaveLength(1);
  });

  it('concurrent generates share one call and generating flips (AC-19)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrRiskBrief: REPLY } });
    const inner = llm.completeStructured.bind(llm);
    llm.completeStructured = (async (req: never) => {
      await gate;
      return inner(req);
    }) as typeof llm.completeStructured;
    const { svc } = makeService({ llm });
    const a = svc.generate('w', 'pr1');
    const b = svc.generate('w', 'pr1');
    await new Promise((r) => setTimeout(r, 10));
    expect((await svc.get('w', 'pr1')).generating).toBe(true);
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(ra.brief).toEqual(rb.brief);
    expect((await svc.get('w', 'pr1')).generating).toBe(false);
  });

  it('a failed flight rejects BOTH concurrent callers and clears generating (AC-19)', async () => {
    let fail!: (e: Error) => void;
    const gate = new Promise<never>((_, rej) => (fail = rej));
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrRiskBrief: REPLY } });
    llm.completeStructured = (async () => gate) as typeof llm.completeStructured;
    const completeSpy = vi.spyOn(llm, 'completeStructured');
    const { svc, save } = makeService({ llm });
    const a = svc.generate('w', 'pr1').catch((e: unknown) => e);
    const b = svc.generate('w', 'pr1').catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 10));
    expect((await svc.get('w', 'pr1')).generating).toBe(true);
    fail(Object.assign(new Error('boom'), { status: 500 }));
    const [ea, eb] = await Promise.all([a, b]);
    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(ea).toBeInstanceOf(BriefGenerationError);
    expect(eb).toBeInstanceOf(BriefGenerationError);
    const after = await svc.get('w', 'pr1');
    expect(after.generating).toBe(false);
    expect(after.brief).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('a throwing logger never affects the result', async () => {
    const { svc } = makeService();
    const logger = {
      info: () => {
        throw new Error('log');
      },
      warn: () => undefined,
    };
    await expect(svc.generate('w', 'pr1', logger)).resolves.toBeTruthy();
  });

  it('missing inputs: intent null + blast index_failed (AC-5)', async () => {
    const { svc } = makeService();
    const r = await svc.generate('w', 'pr1');
    expect(r.brief?.missing_inputs).toEqual([
      { input: 'intent', reason: 'not_derived' },
      { input: 'blast', reason: 'index_failed' },
      { input: 'smart_diff_roles', reason: 'not_in_build' },
    ]);
  });

  it('a throwing blast gives blast/no_data; a throwing projectContext still generates (AC-5)', async () => {
    const { svc, llm } = makeService({
      over: {
        blast: {
          forPull: async () => {
            throw new Error('blast down');
          },
        },
        projectContext: {
          forBrief: async () => {
            throw new Error('docs down');
          },
        },
      },
    });
    const r = await svc.generate('w', 'pr1');
    expect(r.brief?.missing_inputs).toContainEqual({ input: 'blast', reason: 'no_data' });
    expect(llm.calls).toHaveLength(1);
    expect(r.brief?.truncated.spec_docs).toBe(0);
  });

  it('a second generate replaces the stored brief (AC-11)', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const { svc, save } = makeService({ clock: () => now });
    const first = await svc.generate('w', 'pr1');
    now = new Date('2026-01-02T00:00:00Z');
    const second = await svc.generate('w', 'pr1');
    expect(first.brief?.generated_at).toBe('2026-01-01T00:00:00.000Z');
    expect(second.brief?.generated_at).toBe('2026-01-02T00:00:00.000Z');
    expect(save).toHaveBeenCalledTimes(2);
    expect((await svc.get('w', 'pr1')).brief?.generated_at).toBe('2026-01-02T00:00:00.000Z');
  });

  it('spec docs over the budget are truncated and the call is still made (AC-20)', async () => {
    const big = (n: number) => ({ path: `docs/spec-${n}.md`, content: 'word '.repeat(12_000) });
    const { svc, llm } = makeService({
      over: { projectContext: { forBrief: async () => ({ included: [big(1), big(2)] }) } },
    });
    const r = await svc.generate('w', 'pr1');
    expect(llm.calls).toHaveLength(1);
    expect(r.brief?.truncated.spec_docs).toBeGreaterThan(0);
  });

  it('stores usage of the result; null cost stays null; only briefRepo.save writes (AC-21)', async () => {
    const { svc, save } = makeService();
    const r = await svc.generate('w', 'pr1');
    expect(r.brief?.usage).toEqual({
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0]).toBe('pr1');
    expect(save.mock.calls[0]![1]).toEqual(r.brief);

    const noCost = new MockLLMProvider('openai', { structuredBySchema: { PrRiskBrief: REPLY } });
    const inner = noCost.completeStructured.bind(noCost);
    noCost.completeStructured = (async (req: never) => ({
      ...(await inner(req)),
      costUsd: null,
    })) as typeof noCost.completeStructured;
    const second = makeService({ llm: noCost });
    const r2 = await second.svc.generate('w', 'pr1');
    expect(r2.brief?.usage.cost_usd).toBeNull();
    expect(second.save).toHaveBeenCalledTimes(1);
  });
});

describe('BriefService over the real OpenRouterProvider (AC-3, SDK boundary)', () => {
  // Braces matter: a beforeEach that RETURNS the mock makes vitest call it as a cleanup function.
  beforeEach(() => {
    sdkCreate.mockReset();
  });

  function realProviderService() {
    const provider = new OpenRouterProvider('test-key', { timeoutMs: 60_000, maxRetries: 0 });
    const { svc, save } = makeService({ over: { briefLlm: async () => provider } });
    return { svc, save };
  }
  const okReply = {
    choices: [{ message: { content: JSON.stringify(REPLY) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 11, completion_tokens: 7, cost: 0.002 },
  };
  const badReply = { choices: [{ message: { content: 'not json' }, finish_reason: 'stop' }], usage: {} };

  it('a valid reply makes exactly 1 SDK call and stores a brief', async () => {
    sdkCreate.mockResolvedValueOnce(okReply);
    const { svc, save } = realProviderService();
    const r = await svc.generate('w', 'pr1');
    expect(sdkCreate).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(r.brief?.usage).toMatchObject({ tokens_in: 11, tokens_out: 7, cost_usd: 0.002 });
  });

  it('an invalid reply twice makes exactly 2 SDK calls then invalid_reply, nothing saved', async () => {
    sdkCreate.mockResolvedValue(badReply);
    const { svc, save } = realProviderService();
    const err = await svc.generate('w', 'pr1').catch((e: unknown) => e);
    expect(sdkCreate).toHaveBeenCalledTimes(2);
    expect(err).toBeInstanceOf(BriefGenerationError);
    expect((err as BriefGenerationError).details).toEqual({ reason: 'invalid_reply' });
    expect(save).not.toHaveBeenCalled();
  });

  it('a transport error makes exactly 1 SDK call then provider_error, nothing saved', async () => {
    sdkCreate.mockRejectedValue(Object.assign(new Error('upstream'), { status: 500 }));
    const { svc, save } = realProviderService();
    const err = await svc.generate('w', 'pr1').catch((e: unknown) => e);
    expect(sdkCreate).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(BriefGenerationError);
    expect((err as BriefGenerationError).details).toEqual({ reason: 'provider_error' });
    expect(save).not.toHaveBeenCalled();
  });
});
