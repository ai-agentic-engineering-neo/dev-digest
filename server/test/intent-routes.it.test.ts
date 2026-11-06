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
import { INTENT_SCHEMA_NAME } from '../src/modules/intent/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FIXTURE = {
  intent: 'Fix the login redirect loop.',
  in_scope: ['login redirect'],
  out_of_scope: [],
  kind: 'fix',
  relied_on: ['pr_body', 'issue:12'],
  sources_conflict: false,
};

d('Intent routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let seq = 100;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'intent-app', fullName: 'acme/intent-app', clonePath: '/clones/x' })
      .returning();
    repoId = r!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newPr(body: string | null, ws = workspaceId, repo = repoId): Promise<string> {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws, repoId: repo, number: seq++, title: 'Fix login', author: 'a', branch: 'fix/login',
        base: 'main', headSha: 'sha-1', body,
      })
      .returning();
    return pr!.id;
  }

  async function makeApp(over: { openrouter?: MockLLMProvider; openai?: MockLLMProvider } = {}) {
    const fixtures = { structuredBySchema: { [INTENT_SCHEMA_NAME]: FIXTURE } };
    const mockA = over.openrouter ?? new MockLLMProvider('openai', fixtures);
    const mockB = over.openai ?? new MockLLMProvider('openai', fixtures);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git: new MockGitClient({ files: {} }),
        llm: { openrouter: mockA, openai: mockB },
      },
    });
    return { app, mockA, mockB };
  }

  it('GET on a fresh PR returns null', async () => {
    const { app } = await makeApp();
    const prId = await newPr('Fix the login redirect loop by resetting the cookie when the session expires. '.repeat(2));
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    await app.close();
  });

  it('refresh / override / reset lifecycle', async () => {
    const { app } = await makeApp();
    const prId = await newPr('Closes #12');

    const refreshed = await app.inject({ method: 'POST', url: `/pulls/${prId}/intent/refresh` });
    expect(refreshed.statusCode).toBe(200);
    const dto = refreshed.json();
    expect(dto.origin).toBe('derived');
    expect(dto.provider).toBe('openrouter');
    expect(dto.cost_usd).toBe(0.001);
    expect(dto.tokens_in).toBe(100);
    const issue = dto.sources.find((s: { id: string }) => s.id === 'issue:12');
    expect(issue?.status).toBe('read');

    const bad = await app.inject({
      method: 'PUT',
      url: `/pulls/${prId}/intent`,
      payload: { intent: ' Fix X ', in_scope: ['a', ''], out_of_scope: [] },
    });
    expect(bad.statusCode).toBe(422); // validation errors are 422 in this app

    const ok = await app.inject({
      method: 'PUT',
      url: `/pulls/${prId}/intent`,
      payload: { intent: ' Fix X ', in_scope: ['a'], out_of_scope: [] },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().origin).toBe('user');
    expect(ok.json().intent).toBe('Fix X');

    const again = await app.inject({ method: 'POST', url: `/pulls/${prId}/intent/refresh` });
    expect(again.statusCode).toBe(200);
    expect(again.json().origin).toBe('user');

    const del = await app.inject({ method: 'DELETE', url: `/pulls/${prId}/intent` });
    expect(del.statusCode).toBe(200);
    expect(del.json().origin).toBe('derived');
    await app.close();
  });

  it('feature_models.review_intent routes the call to the chosen provider', async () => {
    const { app, mockA, mockB } = await makeApp();
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { review_intent: { provider: 'openai', model: 'gpt-4.1-mini' } } },
    });
    expect(put.statusCode).toBe(200);

    const prId = await newPr('Closes #12');
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/intent/refresh` });
    expect(res.statusCode).toBe(200);
    expect(res.json().provider).toBe('openai');
    expect(res.json().model).toBe('gpt-4.1-mini');
    expect(mockB.calls.some((c) => c.method === 'completeStructured')).toBe(true);
    expect(mockA.calls.some((c) => c.method === 'completeStructured')).toBe(false);

    // restore the default so later tests keep using openrouter
    await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { review_intent: { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' } } },
    });
    await app.close();
  });

  it('another workspace PR is 404 on every verb; non-uuid is rejected', async () => {
    const { app } = await makeApp();
    const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [r2] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws2!.id, owner: 'zed', name: 'other-app', fullName: 'zed/other-app', clonePath: '/clones/y' })
      .returning();
    const foreign = await newPr('Closes #12', ws2!.id, r2!.id);

    const base = `/pulls/${foreign}/intent`;
    expect((await app.inject({ method: 'GET', url: base })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `${base}/refresh` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: base, payload: { intent: 'x', in_scope: [], out_of_scope: [] } })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: base })).statusCode).toBe(404);

    const notUuid = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/intent' });
    expect(notUuid.statusCode).toBe(422);
    await app.close();
  });

  it('refresh with a failing LLM returns 502 external_service_error', async () => {
    const failing = new MockLLMProvider('openai', {});
    failing.completeStructured = async () => {
      throw new Error('boom');
    };
    const { app } = await makeApp({ openrouter: failing });
    const prId = await newPr('Closes #12');
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/intent/refresh` });
    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.json())).toContain('external_service_error');
    await app.close();
  });
});
