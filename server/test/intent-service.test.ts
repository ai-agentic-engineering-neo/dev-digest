import { describe, it, expect } from 'vitest';
import type { IssueMeta, RepoRef } from '@devdigest/shared';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { IntentService, type IntentDeps } from '../src/modules/intent/service.js';
import { INTENT_SCHEMA_NAME } from '../src/modules/intent/constants.js';
import type { IntentRecord } from '../src/modules/intent/domain/types.js';
import type {
  DerivedIntentWrite,
  IntentChangedFile,
  IntentFailureWrite,
  IntentOverrideWrite,
  IntentPullContext,
  IntentRepositoryPort,
} from '../src/modules/intent/ports.js';
import { ExternalServiceError } from '../src/platform/errors.js';

const WS = 'ws-1';
const PR = '00000000-0000-4000-8000-000000000001';

class FakeIntentRepo implements IntentRepositoryPort {
  rec: IntentRecord | undefined;
  choice: { provider: 'openai' | 'anthropic' | 'openrouter'; model: string } | undefined;
  constructor(
    public ctx: IntentPullContext,
    public files: IntentChangedFile[] = [],
    public commits: string[] = [],
  ) {}
  async getPullContext(ws: string, prId: string) {
    return ws === WS && prId === this.ctx.prId ? this.ctx : undefined;
  }
  async listCommitMessages() {
    return this.commits;
  }
  async listChangedFiles() {
    return this.files;
  }
  async knownPullNumbers() {
    return new Set<number>();
  }
  async get() {
    return this.rec;
  }
  private base(): IntentRecord {
    return {
      prId: PR, status: 'none', derived: null, kind: 'unknown', confidence: 'low', confidenceReason: 'indirect_only',
      confidenceLowered: false, sources: [], headSha: null, inputHash: null, bodyHash: null, usage: null, error: null,
      override: null, updatedAt: new Date(),
    };
  }
  async saveDerived(_id: string, w: DerivedIntentWrite) {
    this.rec = {
      ...(this.rec ?? this.base()), status: 'ok', derived: w.derived, kind: w.kind, confidence: w.confidence,
      confidenceReason: w.confidenceReason, confidenceLowered: w.confidenceLowered, sources: w.sources,
      headSha: w.headSha, inputHash: w.inputHash, bodyHash: w.bodyHash, usage: w.usage, error: null, updatedAt: new Date(),
    };
    return this.rec;
  }
  async saveFailure(_id: string, w: IntentFailureWrite) {
    if (this.rec?.status === 'ok') return this.rec;
    this.rec = { ...(this.rec ?? this.base()), status: 'failed', error: w.error, sources: w.sources, headSha: w.headSha };
    return this.rec;
  }
  async setOverride(_id: string, w: IntentOverrideWrite) {
    this.rec = { ...(this.rec ?? this.base()), override: { intent: w.intent, inScope: w.inScope, outOfScope: w.outOfScope, headSha: w.headSha, at: new Date() } };
    return this.rec;
  }
  async clearOverride() {
    if (!this.rec) return undefined;
    this.rec = { ...this.rec, override: null };
    if (this.rec.status === 'none') {
      this.rec = undefined;
      return undefined;
    }
    return this.rec;
  }
  async featureModelOverride() {
    return this.choice;
  }
}

class IssueGitHub extends MockGitHubClient {
  public issueCalls: number[] = [];
  override async getIssue(_repo: RepoRef, n: number): Promise<IssueMeta> {
    this.issueCalls.push(n);
    if (n === 999) throw new Error('404');
    return { number: n, title: `Issue ${n}`, body: 'Users cannot log in after the session timeout.', state: 'open' };
  }
}

const baseCtx = (over: Partial<IntentPullContext> = {}): IntentPullContext => ({
  prId: PR, repoId: 'repo-1', number: 5, title: 'Fix login timeout', body: null, branch: 'fix/login',
  headSha: 'sha-1', owner: 'acme', name: 'app', fullName: 'acme/app', cloned: true, ...over,
});

const FIXTURE = {
  intent: 'Fix the login timeout.',
  in_scope: ['session refresh'],
  out_of_scope: [],
  kind: 'fix',
  relied_on: ['pr_body'],
  sources_conflict: false,
};

function setup(opts: { ctx?: Partial<IntentPullContext>; files?: Record<string, string>; fixture?: unknown } = {}) {
  const repo = new FakeIntentRepo(baseCtx(opts.ctx));
  const llm = new MockLLMProvider('openai', { structuredBySchema: { [INTENT_SCHEMA_NAME]: opts.fixture ?? FIXTURE } });
  const git = new MockGitClient({ files: opts.files ?? {} });
  const gh = new IssueGitHub();
  const readFiles: string[] = [];
  const origRead = git.readFile.bind(git);
  git.readFile = async (r, p) => {
    readFiles.push(p);
    return origRead(r, p);
  };
  const deps: IntentDeps = { intentRepo: repo, git, github: async () => gh, llm: async () => llm };
  const llmCalls = () => llm.calls.filter((c) => c.method === 'completeStructured');
  return { repo, llm, git, gh, readFiles, svc: new IntentService(deps), llmCalls };
}

const LONG_BODY = 'This change makes the session refresh happen before the token expires, so users stop being logged out in the middle of work.';

describe('IntentService', () => {
  it('AC1: closing issue + linked doc -> high confidence, both sources read', async () => {
    const s = setup({
      ctx: { body: `${LONG_BODY}\n\nCloses #12\nSee plans/foo.md` },
      files: { 'plans/foo.md': '# Plan\nRefresh sessions early.' },
    });
    const dto = await s.svc.refresh(WS, PR);
    expect(dto.confidence).toBe('high');
    const issue = dto.sources.find((x) => x.id === 'issue:12');
    expect(issue).toMatchObject({ status: 'read', weight: 'strong' });
    expect(dto.sources.find((x) => x.id === 'doc:plans/foo.md')).toMatchObject({ status: 'read', used: true });
  });

  it('AC3: template-only body -> low / indirect_only with indirect sources offered', async () => {
    const s = setup({ ctx: { body: '## Summary\n\n- [ ] tests\n' } });
    s.repo.files = [{ path: 'src/a.ts', patch: null }];
    s.repo.commits = ['wip'];
    const dto = await s.svc.refresh(WS, PR);
    expect(dto.confidence).toBe('low');
    expect(dto.confidence_reason).toBe('indirect_only');
    const used = dto.sources.filter((x) => x.used).map((x) => x.id);
    expect(used).toEqual(expect.arrayContaining(['title', 'branch', 'commits', 'paths']));
  });

  it('AC4: unsafe, missing and external links never throw and are never fetched', async () => {
    const s = setup({
      ctx: { body: `${LONG_BODY}\n[a](../x.md) docs/missing.md https://example.com/p?t=1` },
      files: {},
    });
    s.git.readFile = async (_r, p) => {
      s.readFiles.push(p);
      throw new Error('ENOENT');
    };
    const dto = await s.svc.refresh(WS, PR);
    expect(dto.sources.some((x) => x.reason === 'unsafe_path')).toBe(true);
    expect(dto.sources.find((x) => x.id === 'doc:docs/missing.md')).toMatchObject({ status: 'unavailable', reason: 'not_found' });
    expect(dto.sources.find((x) => x.kind === 'external_link')).toMatchObject({ status: 'skipped_external', ref: 'example.com' });
    expect(s.readFiles).toEqual(['docs/missing.md']);
    expect(s.gh.issueCalls).toEqual([]);
  });

  it('AC5: workspace override picks the model', async () => {
    const s = setup({ ctx: { body: LONG_BODY } });
    s.repo.choice = { provider: 'openai', model: 'gpt-4.1-mini' };
    const dto = await s.svc.refresh(WS, PR);
    expect((s.llmCalls()[0]?.req as { model: string }).model).toBe('gpt-4.1-mini');
    expect(dto.model).toBe('gpt-4.1-mini');
  });

  it('AC6: cache + single-flight', async () => {
    const s = setup({ ctx: { body: LONG_BODY } });
    await s.svc.forReview(WS, PR);
    await s.svc.forReview(WS, PR);
    expect(s.llmCalls()).toHaveLength(1);

    const p = setup({ ctx: { body: LONG_BODY } });
    await Promise.all([p.svc.forReview(WS, PR), p.svc.forReview(WS, PR), p.svc.forReview(WS, PR)]);
    expect(p.llmCalls()).toHaveLength(1);

    s.repo.ctx = { ...s.repo.ctx, body: `${LONG_BODY} Also more.` };
    await s.svc.forReview(WS, PR);
    expect(s.llmCalls()).toHaveLength(2);
    s.repo.ctx = { ...s.repo.ctx, headSha: 'sha-2' };
    await s.svc.forReview(WS, PR);
    expect(s.llmCalls()).toHaveLength(3);
  });

  it('AC7: LLM failure -> forReview skipped, refresh 502, ok row kept', async () => {
    const s = setup({ ctx: { body: LONG_BODY } });
    await s.svc.refresh(WS, PR);
    s.llm.completeStructured = async () => {
      throw new Error('boom');
    };
    s.repo.ctx = { ...s.repo.ctx, headSha: 'sha-2' };
    const r = await s.svc.forReview(WS, PR);
    expect(r.status).toBe('skipped');
    await expect(s.svc.refresh(WS, PR)).rejects.toBeInstanceOf(ExternalServiceError);
    expect(s.repo.rec?.status).toBe('ok');
  });

  it('AC11: override survives refresh, goes stale, is used without an LLM call, and resets', async () => {
    const s = setup({ ctx: { body: LONG_BODY } });
    await s.svc.setOverride(WS, PR, { intent: ' Mine ', in_scope: ['a', ' '], out_of_scope: [] });
    const refreshed = await s.svc.refresh(WS, PR);
    expect(refreshed.origin).toBe('user');
    expect(refreshed.intent).toBe('Mine');
    expect(refreshed.in_scope).toEqual(['a']);
    const calls = s.llmCalls().length;
    s.repo.ctx = { ...s.repo.ctx, headSha: 'sha-2' };
    const moved = await s.svc.get(WS, PR);
    expect(moved).toMatchObject({ stale: true, stale_reason: 'head_moved' });
    const r = await s.svc.forReview(WS, PR);
    expect(r.status === 'ready' && r.step.cache).toBe('override');
    expect(s.llmCalls()).toHaveLength(calls);
    expect((await s.svc.resetOverride(WS, PR))?.origin).toBe('derived');
  });

  it('rejects a blank override and unknown workspaces', async () => {
    const s = setup();
    await expect(s.svc.setOverride(WS, PR, { intent: '  ', in_scope: [], out_of_scope: [] })).rejects.toThrow();
    await expect(s.svc.get('other', PR)).rejects.toThrow();
  });

  it('clamps relied_on to offered ids and lowers confidence on conflict', async () => {
    const s = setup({
      ctx: { body: LONG_BODY },
      fixture: { ...FIXTURE, relied_on: ['pr_body', 'issue:999'], sources_conflict: true },
    });
    const dto = await s.svc.refresh(WS, PR);
    expect(dto.sources.filter((x) => x.cited).map((x) => x.id)).toEqual(['pr_body']);
    expect(dto.confidence).toBe('medium');
    expect(dto.confidence_lowered).toBe(true);
  });

  it('classifier request: static system prompt, untrusted user content, capped call', async () => {
    const s = setup({ ctx: { body: `${LONG_BODY} UNIQUE-BODY-MARKER` } });
    await s.svc.refresh(WS, PR);
    const req = s.llmCalls()[0]?.req as {
      messages: { role: string; content: string }[];
      maxTokens: number;
      temperature: number;
      timeoutMs: number;
    };
    expect(req.messages[0]?.content).not.toContain('UNIQUE-BODY-MARKER');
    expect(req.messages[1]?.content).toContain('<untrusted source="pr-body">');
    expect(req.messages[1]?.content).toContain('UNIQUE-BODY-MARKER');
    expect(req.maxTokens).toBe(800);
    expect(req.temperature).toBe(0);
    expect(req.timeoutMs).toBe(30_000);
  });
});
