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
// @fastify/rate-limit is registered only outside NODE_ENV=test (src/app.ts); silent turns the logger off.
const config = () =>
  loadConfig({ ...process.env, NODE_ENV: 'production', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

const FIXTURE = {
  intent: 'Fix the login redirect loop.',
  in_scope: ['login redirect'],
  out_of_scope: [],
  kind: 'fix',
  relied_on: ['pr_body'],
  sources_conflict: false,
};
const OVERRIDE = { intent: 'Custom intent', in_scope: ['a'], out_of_scope: [] };

d('Intent route rate limits (Testcontainers pg)', () => {
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
      .values({ workspaceId, owner: 'acme', name: 'rl-app', fullName: 'acme/rl-app', clonePath: '/clones/rl' })
      .returning();
    repoId = r!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newPr(): Promise<string> {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId, number: seq++, title: 'Fix login', author: 'a', branch: 'fix/login',
        base: 'main', headSha: 'sha-rl', body: 'Closes #12',
      })
      .returning();
    return pr!.id;
  }

  async function makeApp() {
    const fixtures = { structuredBySchema: { [INTENT_SCHEMA_NAME]: FIXTURE } };
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git: new MockGitClient({ files: {} }),
        llm: {
          openrouter: new MockLLMProvider('openai', fixtures),
          openai: new MockLLMProvider('openai', fixtures),
        },
      },
    });
  }

  it('PUT override: 20 pass, the 21st is 429 with retry-after; GET stays open', async () => {
    const app = await makeApp();
    const prId = await newPr();
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({ method: 'PUT', url: `/pulls/${prId}/intent`, payload: OVERRIDE });
      expect(res.statusCode).toBe(200);
    }
    const limited = await app.inject({ method: 'PUT', url: `/pulls/${prId}/intent`, payload: OVERRIDE });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();

    // Per-route stores are separate: GET is not affected.
    const get = await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` });
    expect(get.statusCode).toBe(200);
    await app.close();
  });

  it('refresh: 10 pass, the 11th is 429 (regression)', async () => {
    const app = await makeApp();
    const prId = await newPr();
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/intent/refresh` });
      expect(res.statusCode).toBe(200);
    }
    const limited = await app.inject({ method: 'POST', url: `/pulls/${prId}/intent/refresh` });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    await app.close();
  });
});
