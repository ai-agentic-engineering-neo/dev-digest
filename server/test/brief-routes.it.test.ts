import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import { BRIEF_SCHEMA_NAME } from '../src/modules/brief/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FIXTURE = {
  summary: 'Adds a guard to the login handler.',
  risks: [],
  review_focus: [{ file: 'src/login.ts', line: 11, reason: 'The new guard.' }],
};
const PATCH = '@@ -10,3 +10,4 @@ function login() {\n a\n+b\n c\n';

class ThrowingLLM extends MockLLMProvider {
  override async completeStructured<T>(): Promise<never> {
    throw new Error('upstream down');
  }
}

d('Brief routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let seq = 500;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'brief-app', fullName: 'acme/brief-app', clonePath: '/clones/x' })
      .returning();
    repoId = r!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newPr(ws = workspaceId, repo = repoId): Promise<string> {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws, repoId: repo, number: seq++, title: 'Guard login', author: 'a', branch: 'fix/login',
        base: 'main', headSha: 'sha-1', body: 'Adds a guard.',
      })
      .returning();
    await pg.handle.db
      .insert(t.prFiles)
      .values({ prId: pr!.id, path: 'src/login.ts', additions: 1, deletions: 0, patch: PATCH });
    return pr!.id;
  }

  async function makeApp(opts: { llm?: MockLLMProvider | null } = {}) {
    const mock =
      opts.llm === undefined
        ? new MockLLMProvider('openai', { structuredBySchema: { [BRIEF_SCHEMA_NAME]: FIXTURE } })
        : opts.llm;
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git: new MockGitClient({ files: {} }),
        ...(mock ? { llm: { openrouter: mock } } : {}),
      },
    });
    return { app, mock };
  }
  const calls = (m: MockLLMProvider | null | undefined) =>
    m ? m.calls.filter((c) => c.method === 'completeStructured').length : 0;

  it('GET is null and calls nothing; POST generates; GET again is stable', async () => {
    const { app, mock } = await makeApp();
    const prId = await newPr();
    const first = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(first.statusCode).toBe(200);
    expect(first.json().brief).toBeNull();
    expect(calls(mock)).toBe(0);

    const post = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(post.statusCode).toBe(200);
    const generatedAt = post.json().brief.generated_at;
    expect(post.json().generating).toBe(false);

    const again = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(again.json().brief.generated_at).toBe(generatedAt);
    expect(calls(mock)).toBe(1);
    await app.close();
  });

  it('no key and no override -> 422 brief_model_not_configured', async () => {
    const { app } = await makeApp({ llm: null });
    const prId = await newPr();
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(422);
    const text = JSON.stringify(res.json());
    expect(text).toContain('brief_model_not_configured');
    expect(text).toContain('openrouter');
    await app.close();
  });

  it('a failing model -> 502 and the previous brief stays', async () => {
    const good = await makeApp();
    const prId = await newPr();
    expect((await good.app.inject({ method: 'POST', url: `/pulls/${prId}/brief` })).statusCode).toBe(200);
    await good.app.close();

    const bad = await makeApp({ llm: new ThrowingLLM('openai') });
    const res = await bad.app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.json())).toContain('brief_generation_failed');
    const get = await bad.app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(get.json().brief).not.toBeNull();
    await bad.app.close();
  });

  it('a provider error with a secret -> 502 with only the classified reason, secret not in the body', async () => {
    class SecretLLM extends MockLLMProvider {
      override async completeStructured<T>(): Promise<never> {
        throw Object.assign(new Error('401 Unauthorized: invalid key sk-test-secret'), { status: 401 });
      }
    }
    const { app } = await makeApp({ llm: new SecretLLM('openai') });
    const prId = await newPr();
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain('sk-test-secret');
    expect(res.json().error).toMatchObject({ code: 'brief_generation_failed', details: { reason: 'provider_error' } });
    await app.close();
  });

  it('unknown PR id -> 404', async () => {
    const { app } = await makeApp();
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/pulls/${id}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${id}/brief` })).statusCode).toBe(404);
    await app.close();
  });

  it('a PR of another workspace -> 404 and no model call', async () => {
    const { app, mock } = await makeApp();
    const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [repo2] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws2!.id, owner: 'x', name: 'y', fullName: 'x/y', clonePath: '/clones/y' })
      .returning();
    const prId = await newPr(ws2!.id, repo2!.id);
    expect((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` })).statusCode).toBe(404);
    expect(calls(mock)).toBe(0);
    await app.close();
  });

  it('two concurrent POSTs share one call', async () => {
    const { app, mock } = await makeApp();
    const prId = await newPr();
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/pulls/${prId}/brief` }),
      app.inject({ method: 'POST', url: `/pulls/${prId}/brief` }),
    ]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.json().brief.generated_at).toBe(b.json().brief.generated_at);
    expect(calls(mock)).toBe(1);
    await app.close();
  });

  it('generation leaves the PR-list cost_usd untouched', async () => {
    const { app } = await makeApp();
    const prId = await newPr();
    const list = async () => {
      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
      return (res.json() as { id: string; cost_usd: number | null }[]).find((p) => p.id === prId)?.cost_usd;
    };
    const before = await list();
    expect((await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` })).statusCode).toBe(200);
    expect(await list()).toBe(before);
    await app.close();
  });
});
