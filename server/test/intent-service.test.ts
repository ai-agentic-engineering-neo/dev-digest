import { describe, it, expect } from 'vitest';
import { IntentService } from '../src/modules/reviews/intent-service.js';
import type {
  IntentDeps,
  IntentInputs,
  IntentLog,
  IntentRepositoryPort,
  SaveIntentInput,
  StoredIntent,
} from '../src/modules/reviews/ports.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ConfigError, ExternalServiceError, NotFoundError } from '../src/platform/errors.js';

const WS = 'ws-1';
const PR = 'pr-1';

const inputs: IntentInputs = {
  prId: PR,
  owner: 'acme',
  repoName: 'api',
  number: 482,
  title: 'Add rate limiting',
  body: 'Adds a limiter to the public API. Closes #471. '.repeat(6),
  branch: 'feat/rate-limit',
  headSha: 'a1b2c3d4',
  commits: ['Add limiter\n\nlong body'],
  changedPaths: ['src/limiter.ts'],
};

class FakeRepo implements IntentRepositoryPort {
  stored: StoredIntent | undefined;
  saves = 0;
  constructor(public inp: IntentInputs | undefined = inputs) {}
  async getInputs(ws: string, prId: string) {
    return ws === WS && prId === PR ? this.inp : undefined;
  }
  async get(ws: string, prId: string) {
    return ws === WS && prId === PR ? this.stored : undefined;
  }
  async save(ws: string, prId: string, v: SaveIntentInput) {
    if (ws !== WS || prId !== PR) return undefined;
    this.saves += 1;
    this.stored = { prId, ...v };
    return this.stored;
  }
}

function logs() {
  const lines: { kind: string; msg: string }[] = [];
  const log: IntentLog = {
    info: (msg) => lines.push({ kind: 'info', msg }),
    tool: (msg) => lines.push({ kind: 'tool', msg }),
    result: (msg) => lines.push({ kind: 'result', msg }),
  };
  return { lines, log };
}

const fixture = { intent: 'Rate limits the public API.', in_scope: ['limiter'], out_of_scope: [] };

function build(over: { repo?: FakeRepo; llm?: MockLLMProvider; github?: IntentDeps['github']; model?: string } = {}) {
  const repo = over.repo ?? new FakeRepo();
  const llm = over.llm ?? new MockLLMProvider('openai', { structured: fixture });
  const gh = new MockGitHubClient({ closingIssues: [471], issues: { 471: { number: 471, title: 'Rate limit', body: 'Add limits', state: 'open' } } });
  const svc = new IntentService({
    repo,
    github: over.github ?? (async () => gh),
    git: new MockGitClient(),
    llm: async () => llm,
    featureModel: async () => ({ provider: 'openrouter', model: over.model ?? 'deepseek/deepseek-v4-flash' }),
  });
  return { svc, repo, llm };
}

const llmCalls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured').length;

describe('IntentService.ensureIntent', () => {
  it('derives once, then serves the cache without another LLM call', async () => {
    const { svc, llm, repo } = build();
    const a = logs();
    const first = await svc.ensureIntent(WS, PR, { log: a.log });
    expect(first.status).toBe('ok');
    expect(llmCalls(llm)).toBe(1);
    expect(repo.stored?.confidence).toBe('high');
    expect(a.lines.some((l) => l.msg.startsWith('Intent derived: confidence=high'))).toBe(true);

    const b = logs();
    const second = await svc.ensureIntent(WS, PR, { log: b.log });
    expect(second).toMatchObject({ status: 'ok', cached: true });
    expect(llmCalls(llm)).toBe(1);
    expect(repo.saves).toBe(1);
    expect(b.lines[0]!.msg).toMatch(/^Intent: cached \(confidence=high/);
  });

  it('re-derives when the head sha, body or model changes', async () => {
    const { svc, llm, repo } = build();
    await svc.ensureIntent(WS, PR, { log: logs().log });
    repo.inp = { ...inputs, headSha: 'ffff0000' };
    await svc.ensureIntent(WS, PR, { log: logs().log });
    repo.inp = { ...inputs, headSha: 'ffff0000', body: 'changed body' };
    await svc.ensureIntent(WS, PR, { log: logs().log });
    expect(llmCalls(llm)).toBe(3);
  });

  it('GitHub without a token: sources skipped, still derives, confidence by body only', async () => {
    const { svc, repo } = build({
      github: async () => {
        throw new ConfigError('GITHUB_TOKEN missing');
      },
    });
    const res = await svc.ensureIntent(WS, PR, { log: logs().log });
    expect(res.status).toBe('ok');
    expect(repo.stored?.confidence).toBe('medium');
    expect(repo.stored?.sources).toContainEqual({ kind: 'github_issue', ref: '#471', status: 'skipped', reason: 'no_github_token' });
  });

  it('thin body and nothing linked: low confidence, built from title, branch, commits and paths', async () => {
    const repo = new FakeRepo({ ...inputs, body: null });
    const gh = new MockGitHubClient();
    const { svc } = build({ repo, github: async () => gh });
    await svc.ensureIntent(WS, PR, { log: logs().log });
    expect(repo.stored?.confidence).toBe('low');
    expect(repo.stored?.sources.map((s) => s.kind)).toEqual(
      expect.arrayContaining(['title', 'branch', 'body', 'commits', 'files']),
    );
  });

  it('an LLM failure returns failed, logs info (never error) and saves nothing', async () => {
    const llm = new MockLLMProvider('openai', { structured: { not: 'an intent' } });
    const { svc, repo } = build({ llm });
    const { lines, log } = logs();
    const res = await svc.ensureIntent(WS, PR, { log });
    expect(res.status).toBe('failed');
    expect(repo.saves).toBe(0);
    const unavailable = lines.find((l) => l.msg.startsWith('Intent unavailable:'));
    expect(unavailable?.kind).toBe('info');
    expect(lines.some((l) => l.kind === 'error')).toBe(false);
  });

  it('an unknown PR returns failed instead of throwing', async () => {
    const { svc } = build();
    await expect(svc.ensureIntent(WS, 'other', { log: logs().log })).resolves.toMatchObject({ status: 'failed' });
  });
});

describe('IntentService.get / refresh', () => {
  it('get: 404 for a foreign PR and when nothing is derived yet', async () => {
    const { svc } = build();
    await expect(svc.get(WS, 'other')).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.get(WS, PR)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('get: stale is false when fresh and true once the head sha moves', async () => {
    const { svc, repo } = build();
    await svc.ensureIntent(WS, PR, { log: logs().log });
    expect((await svc.get(WS, PR)).stale).toBe(false);
    repo.inp = { ...inputs, headSha: 'moved' };
    const rec = await svc.get(WS, PR);
    expect(rec.stale).toBe(true);
    expect(rec.confidence).toBe('high');
  });

  it('refresh: re-derives even when cached', async () => {
    const { svc, llm } = build();
    await svc.ensureIntent(WS, PR, { log: logs().log });
    const rec = await svc.refresh(WS, PR);
    expect(llmCalls(llm)).toBe(2);
    expect(rec.stale).toBe(false);
    expect(rec.derived_at).not.toBeNull();
  });

  it('refresh: throws ExternalServiceError when derivation fails, NotFoundError for a foreign PR', async () => {
    const { svc } = build({ llm: new MockLLMProvider('openai', { structured: { bad: true } }) });
    await expect(svc.refresh(WS, PR)).rejects.toBeInstanceOf(ExternalServiceError);
    await expect(svc.refresh(WS, 'other')).rejects.toBeInstanceOf(NotFoundError);
  });
});
