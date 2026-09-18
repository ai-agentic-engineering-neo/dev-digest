/**
 * Provider-aware DI wiring — repos/pulls/polling/settings all resolve their
 * code-host client from the repo's persisted `provider`, via
 * `container.codeHost()`, instead of always calling `container.github()`.
 * Gated on Docker (needs Postgres to resolve repo/PR rows), matching the
 * other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta, SecretsProvider } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function insertRepo(db: PgFixture['handle']['db'], workspaceId: string, provider: 'github' | 'gitlab') {
  const name = `wiring-${provider}-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, provider, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

d('provider-aware code-host dispatch (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('GET /repos/:id/pulls on a gitlab repo calls the GitLab client, never GitHub', async () => {
    const github = new MockGitHubClient({ pulls: [] });
    const gitlab = new MockGitHubClient({
      pulls: [
        {
          number: 1,
          title: 'gitlab MR',
          author: 'demch',
          branch: 'feat/x',
          base: 'main',
          head_sha: 'sha1',
          additions: 1,
          deletions: 0,
          files_count: 1,
          status: 'open',
        },
      ],
    });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github, gitlab } });
    const repo = await insertRepo(pg.handle.db, workspaceId, 'gitlab');

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrMeta[];
    expect(body).toHaveLength(1);
    expect(body[0]!.title).toBe('gitlab MR');
  });

  it('GET /repos/:id/pulls on a github repo still calls the GitHub client', async () => {
    const github = new MockGitHubClient({
      pulls: [
        {
          number: 2,
          title: 'github PR',
          author: 'marisa',
          branch: 'feat/y',
          base: 'main',
          head_sha: 'sha2',
          additions: 1,
          deletions: 0,
          files_count: 1,
          status: 'open',
        },
      ],
    });
    const gitlab = new MockGitHubClient({ pulls: [] });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github, gitlab } });
    const repo = await insertRepo(pg.handle.db, workspaceId, 'github');

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrMeta[];
    expect(body).toHaveLength(1);
    expect(body[0]!.title).toBe('github PR');
  });

  it('a gitlab repo with no GITLAB_TOKEN/override still serves persisted PRs (offline fallback)', async () => {
    // No `gitlab` override and an explicit "no secrets configured" provider →
    // container.gitlab() throws ConfigError; the route must swallow it and
    // serve what's persisted, exactly like the existing GitHub offline path.
    const noSecrets: SecretsProvider = { get: async () => undefined };
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { secrets: noSecrets } });
    const repo = await insertRepo(pg.handle.db, workspaceId, 'gitlab');
    await pg.handle.db.insert(t.pullRequests).values({
      workspaceId,
      repoId: repo.id,
      number: 3,
      title: 'seeded MR',
      author: 'demch',
      branch: 'feat/z',
      base: 'main',
      headSha: 'sha3',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrMeta[];
    expect(body).toHaveLength(1);
    expect(body[0]!.title).toBe('seeded MR');
  });

  it('POST /settings/test-connection {provider: "gitlab"} uses the GitLab client and never echoes the token', async () => {
    const gitlab = new MockGitHubClient({ login: 'demch' });
    // In-memory secrets override — a real `key` in the payload must never
    // touch the developer's actual ~/.devdigest/secrets.json.
    let persisted: string | undefined;
    const secrets: SecretsProvider = {
      get: async () => persisted,
      set: async (_key, value) => {
        persisted = value;
      },
    };
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { gitlab, secrets } });

    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'gitlab', key: 'glpat-super-secret' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { provider: string; ok: boolean; message: string };
    expect(body).toEqual({ provider: 'gitlab', ok: true, message: 'Connected as @demch' });
    expect(JSON.stringify(body)).not.toContain('glpat-super-secret');
  });

  it('GET /settings/secrets-status reports a gitlab boolean without leaking the value', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: {} });
    const res = await app.inject({ method: 'GET', url: '/settings/secrets-status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('gitlab');
    expect(typeof body.gitlab).toBe('boolean');
  });
});
