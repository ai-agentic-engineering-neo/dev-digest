import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SmartDiff } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SmartDiffRepository } from '../src/modules/smart-diff/repository.js';
import {
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Any model call is a test failure: Smart Diff is deterministic. */
class ThrowingLLM extends MockLLMProvider {
  async listModels(): ReturnType<MockLLMProvider['listModels']> {
    this.calls.push({ method: 'listModels', req: null });
    throw new Error('LLM must not be called');
  }
  async complete(): ReturnType<MockLLMProvider['complete']> {
    this.calls.push({ method: 'complete', req: null });
    throw new Error('LLM must not be called');
  }
  async completeStructured(): Promise<never> {
    this.calls.push({ method: 'completeStructured', req: null });
    throw new Error('LLM must not be called');
  }
  async embed(): ReturnType<MockLLMProvider['embed']> {
    this.calls.push({ method: 'embed', req: null });
    throw new Error('LLM must not be called');
  }
}

const FILES = [
  { path: 'src/core.ts', additions: 10, deletions: 2 },
  { path: 'src/core.test.ts', additions: 5, deletions: 0 },
  { path: 'src/index.ts', additions: 1, deletions: 1 },
  { path: 'README.md', additions: 3, deletions: 0 },
  { path: 'pnpm-lock.yaml', additions: 40, deletions: 20 },
];
const TOTAL = FILES.reduce((n, f) => n + f.additions + f.deletions, 0);

d('Smart Diff route (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let seq = 500;
  const llm = new ThrowingLLM('openai');
  const llmAnthropic = new ThrowingLLM('anthropic');
  const llmRouter = new ThrowingLLM('openai');

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'sd-app', fullName: 'acme/sd-app', clonePath: '/clones/sd' })
      .returning();
    repoId = r!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const llmCalls = () => llm.calls.length + llmAnthropic.calls.length + llmRouter.calls.length;

  async function newPr(ws = workspaceId, repo = repoId): Promise<string> {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws, repoId: repo, number: seq++, title: 'Smart diff', author: 'a', branch: 'feat/sd',
        base: 'main', headSha: 'sha-1', body: null,
      })
      .returning();
    const prId = pr!.id;
    await pg.handle.db.insert(t.prFiles).values(FILES.map((f) => ({ prId, ...f })));
    return prId;
  }

  async function addReview(
    prId: string,
    agentId: string,
    kind: 'review' | 'summary',
    createdAt: Date,
    fs: { file: string; line: number; dismissed?: boolean }[],
  ) {
    const [rv] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, kind, createdAt })
      .returning();
    if (fs.length === 0) return;
    await pg.handle.db.insert(t.findings).values(
      fs.map((f) => ({
        reviewId: rv!.id, file: f.file, startLine: f.line, endLine: f.line, severity: 'WARNING',
        category: 'bug', title: 't', rationale: 'r', confidence: 0.9,
        dismissedAt: f.dismissed ? new Date() : null,
      })),
    );
  }

  async function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git: new MockGitClient({ files: {} }),
        llm: { openai: llm, anthropic: llmAnthropic, openrouter: llmRouter },
      },
    });
  }

  it('S8: groups the files by role, no findings, no model call', async () => {
    const app = await makeApp();
    const prId = await newPr();
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    const paths = (role: string) => body.groups.find((g) => g.role === role)!.files.map((f) => f.path);
    expect(paths('core')).toEqual(['src/core.ts']);
    expect(paths('tests')).toEqual(['src/core.test.ts']);
    expect(paths('wiring')).toEqual(['src/index.ts']);
    expect(paths('docs')).toEqual(['README.md']);
    expect(paths('boilerplate')).toEqual(['pnpm-lock.yaml']);
    for (const g of body.groups) for (const f of g.files) expect(f.finding_lines).toEqual([]);
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: TOTAL, proposed_splits: [] });
    expect(llmCalls()).toBe(0);
    await app.close();
  });

  it('S6/S9: finding lines come from the latest review of each agent, non-dismissed only', async () => {
    const app = await makeApp();
    const prId = await newPr();
    const agentA = randomUUID();
    const agentB = randomUUID();
    await addReview(prId, agentA, 'review', new Date('2026-01-01T10:00:00Z'), [{ file: 'src/core.ts', line: 3 }]);
    await addReview(prId, agentA, 'review', new Date('2026-01-02T10:00:00Z'), [
      { file: 'src/core.ts', line: 10 },
      { file: 'src/core.ts', line: 11, dismissed: true },
    ]);
    await addReview(prId, agentB, 'review', new Date('2026-01-01T12:00:00Z'), [{ file: 'src/core.test.ts', line: 5 }]);
    await addReview(prId, agentB, 'summary', new Date('2026-01-03T12:00:00Z'), [{ file: 'src/core.ts', line: 99 }]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    const lines = (path: string) =>
      body.groups.flatMap((g) => g.files).find((f) => f.path === path)!.finding_lines;
    expect(lines('src/core.ts')).toEqual([10]);
    expect(lines('src/core.test.ts')).toEqual([5]);
    expect(llmCalls()).toBe(0);
    await app.close();
  });

  it('S7: a PR of another workspace is 404 not_found', async () => {
    const app = await makeApp();
    const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [r2] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws2!.id, owner: 'zed', name: 'other-app', fullName: 'zed/other-app', clonePath: '/clones/z' })
      .returning();
    const foreign = await newPr(ws2!.id, r2!.id);
    const res = await app.inject({ method: 'GET', url: `/pulls/${foreign}/smart-diff` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });

  it('repository: listFiles is scoped by workspace, not only by the caller', async () => {
    const prId = await newPr();
    const repo = new SmartDiffRepository(pg.handle.db);
    const own = await repo.listFiles(workspaceId, prId);
    expect(own.map((f) => f.path).sort()).toEqual(FILES.map((f) => f.path).sort());
    const [ws3] = await pg.handle.db.insert(t.workspaces).values({ name: 'third' }).returning();
    expect(await repo.listFiles(ws3!.id, prId)).toEqual([]);
  });

  it('S10: unknown uuid is 404, malformed id is 422 validation_error', async () => {
    const app = await makeApp();
    const unknown = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/smart-diff` });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('not_found');

    const bad = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('validation_error');
    await app.close();
  });
});
