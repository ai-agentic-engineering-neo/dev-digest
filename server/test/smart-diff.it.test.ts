import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockSecretsProvider, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('smart diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const llm = new MockLLMProvider('openrouter', {});

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const db = () => pg.handle.db;

  async function newPr(files: string[], ws = workspaceId) {
    const name = `sd-${seq++}`;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 1,
        title: 'x',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
        status: 'needs_review',
      })
      .returning();
    await db()
      .insert(t.prFiles)
      .values(files.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0 })));
    return pr!;
  }

  async function addReview(
    prId: string,
    agentId: string | null,
    lines: Array<[string, number, boolean?]>,
    at: Date,
  ) {
    const [r] = await db()
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, kind: 'review', createdAt: at })
      .returning();
    if (lines.length)
      await db()
        .insert(t.findings)
        .values(
          lines.map(([file, line, dismissed]) => ({
            reviewId: r!.id,
            file,
            startLine: line,
            endLine: line,
            severity: 'WARNING',
            category: 'bug',
            title: `t${line}`,
            rationale: 'r',
            confidence: 0.5,
            dismissedAt: dismissed ? new Date() : null,
          })),
        );
    return r!;
  }

  async function get(prId: string) {
    const app = await buildApp({
      config: config(),
      db: db(),
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient({}),
        llm: { openrouter: llm },
      },
    });
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    await app.close();
    return res;
  }

  const lines = (body: SmartDiff, path: string) =>
    body.groups.flatMap((g) => g.files).find((f) => f.path === path)!.finding_lines;

  it('groups before any review without a model call or agent run', async () => {
    const pr = await newPr(['src/a.ts', 'test/a.test.ts', 'package.json', 'docs/x.md', 'yarn.lock']);
    const runsBefore = (await db().select().from(t.agentRuns)).length;
    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.has_review).toBe(false);
    expect(body.groups.map((g) => [g.role, g.files.length])).toEqual([
      ['core', 1],
      ['tests', 1],
      ['wiring', 1],
      ['docs', 1],
      ['boilerplate', 1],
    ]);
    expect(body.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
    expect(llm.calls.length).toBe(0);
    expect(await db().select().from(t.agentRuns)).toHaveLength(runsBefore);
  });

  it('uses only the newest review per agent and keeps both agents', async () => {
    const pr = await newPr(['src/a.ts', 'src/b.ts']);
    const agentA = '33333333-3333-4333-8333-333333333333';
    const agentB = '44444444-4444-4444-8444-444444444444';
    await addReview(pr.id, agentA, [['src/a.ts', 1]], new Date('2026-01-01'));
    await addReview(pr.id, agentA, [['src/a.ts', 7]], new Date('2026-01-02'));
    await addReview(pr.id, agentB, [['src/b.ts', 5]], new Date('2026-01-01'));
    const body = SmartDiff.parse((await get(pr.id)).json());
    expect(body.has_review).toBe(true);
    expect(lines(body, 'src/a.ts')).toEqual([7]);
    expect(lines(body, 'src/b.ts')).toEqual([5]);
  });

  it('counts the NULL-agent review once and keeps dismissed ids out of finding_lines', async () => {
    const pr = await newPr(['src/a.ts']);
    await addReview(pr.id, null, [['src/a.ts', 1]], new Date('2026-01-01'));
    await addReview(pr.id, null, [['src/a.ts', 2], ['src/a.ts', 3, true]], new Date('2026-01-02'));
    const body = SmartDiff.parse((await get(pr.id)).json());
    const f = body.groups[0]!.files[0]!;
    expect(f.finding_lines).toEqual([2]);
    expect(f.finding_ids).toHaveLength(2);
  });

  it('404 for a PR in another workspace', async () => {
    const [other] = await db().insert(t.workspaces).values({ name: 'other' }).returning();
    const pr = await newPr(['src/a.ts'], other!.id);
    expect((await get(pr.id)).statusCode).toBe(404);
  });
});
