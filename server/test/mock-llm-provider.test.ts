import { describe, it, expect } from 'vitest';
import { Review } from '@devdigest/shared';
import { groundFindings } from '@devdigest/reviewer-core';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import type { Db } from '../src/db/client.js';
import { MockReviewLLMProvider, MOCK_REVIEW, MOCK_USAGE } from '../src/adapters/llm/mock.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { SEED_PR_482_PATCHES } from '../src/db/seed-diff.js';

/** LLM_PROVIDER_OVERRIDE=mock — explicit dev/e2e switch to the deterministic mock LLM. */
const fakeDb = {} as Db;
const noSecrets = { get: async () => undefined, set: async () => undefined } as never;
const cfg = (env: Record<string, string>) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', LLM_PROVIDER_OVERRIDE: '', LLM_MOCK_DELAY_MS: '', ...env });

/** The seeded PR #482 diff exactly as ReviewStore.storedDiff rebuilds it from pr_files. */
function seededDiff() {
  const parts = Object.entries(SEED_PR_482_PATCHES).flatMap(([path, patch]) => [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    patch,
  ]);
  return parseUnifiedDiff(parts.join('\n'));
}

describe('config: LLM_PROVIDER_OVERRIDE', () => {
  it('is off unless set explicitly', () => {
    expect(cfg({}).llmProviderOverride).toBeUndefined();
  });

  it('accepts only "mock" and parses the delay', () => {
    const c = cfg({ LLM_PROVIDER_OVERRIDE: 'mock', LLM_MOCK_DELAY_MS: '250' });
    expect(c.llmProviderOverride).toBe('mock');
    expect(c.llmMockDelayMs).toBe(250);
    expect(() => cfg({ LLM_PROVIDER_OVERRIDE: 'openai' })).toThrow();
  });

  it('is refused in production', () => {
    expect(() => cfg({ LLM_PROVIDER_OVERRIDE: 'mock', NODE_ENV: 'production' })).toThrow(/production/);
  });
});

describe('Container.llm() with the mock override', () => {
  it('resolves every provider id to the mock, without reading any key', async () => {
    const c = new Container(cfg({ LLM_PROVIDER_OVERRIDE: 'mock' }), fakeDb, { secrets: noSecrets });
    for (const id of ['openai', 'anthropic', 'openrouter'] as const) {
      const llm = await c.llm(id);
      expect(llm).toBeInstanceOf(MockReviewLLMProvider);
      expect(llm.id).toBe(id);
    }
  });

  it('without the override a missing key still fails (no silent mock)', async () => {
    const c = new Container(cfg({}), fakeDb, { secrets: noSecrets });
    await expect(c.llm('openrouter')).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it('test overrides still win over the env switch', async () => {
    const injected = new MockLLMProvider('openai');
    const c = new Container(cfg({ LLM_PROVIDER_OVERRIDE: 'mock' }), fakeDb, {
      secrets: noSecrets,
      llm: { openai: injected },
    });
    expect(await c.llm('openai')).toBe(injected);
  });
});

describe('MockReviewLLMProvider', () => {
  it('returns a schema-valid Review, reports usage, and its findings survive grounding on the seeded diff', async () => {
    const usage: unknown[] = [];
    const res = await new MockReviewLLMProvider('openrouter').completeStructured({
      model: 'm',
      schema: Review,
      schemaName: 'Review',
      messages: [{ role: 'user', content: 'review this' }],
      onUsage: (u) => usage.push(u),
    });
    expect(res.data.findings).toHaveLength(MOCK_REVIEW.findings.length);
    expect(usage).toEqual([MOCK_USAGE]);

    const { kept, dropped } = groundFindings(res.data.findings, seededDiff());
    expect(dropped).toEqual([]);
    expect(kept.map((f) => f.title)).toEqual(MOCK_REVIEW.findings.map((f) => f.title));
  });

  it('the seeded sample findings also ground on the seeded diff', () => {
    const diff = seededDiff();
    const seeded = [
      { file: 'src/config.ts', start_line: 12, end_line: 12 },
      { file: 'src/api/users.ts', start_line: 45, end_line: 52 },
    ].map((f, i) => ({ ...MOCK_REVIEW.findings[0]!, id: `s${i}`, ...f }));
    expect(groundFindings(seeded, diff).dropped).toEqual([]);
  });

  it('fails loudly for a schema it has no fixture for', async () => {
    await expect(
      new MockReviewLLMProvider('openai').completeStructured({
        model: 'm',
        schema: Review,
        schemaName: 'OnboardingTour',
        messages: [],
      }),
    ).rejects.toThrow(/no fixture/);
  });

  it('the delay is aborted by the request signal', async () => {
    const ac = new AbortController();
    const call = new MockReviewLLMProvider('openai', { delayMs: 60_000 }).completeStructured({
      model: 'm',
      schema: Review,
      schemaName: 'Review',
      messages: [],
      signal: ac.signal,
    });
    ac.abort(new Error('cancelled'));
    await expect(call).rejects.toThrow('cancelled');
  });
});
