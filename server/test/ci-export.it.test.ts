import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import * as t from '../src/db/schema.js';
import { MockAuthProvider, MockGitClient, MockGitHubClient, type MockGitHubOptions } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-export] Docker not available — skipping integration tests.');
}

/**
 * specs/14-export-to-ci.md (Phase C verification) — the export wizard's full
 * server-side flow (AC-5, AC-7, AC-10a, AC-59), exercised through the REAL
 * `POST /agents/:id/export-ci` route against a real Postgres and a stubbed
 * `GitHubClient` (`MockGitHubClient`) — never a real network call. The
 * `ciRunnerBundleDir` used here is the real `agent-runner/dist` (loadConfig's
 * default) — it must be built (`pnpm --dir agent-runner build`) for this
 * suite to pass, same precondition `bundle.ts`'s own `ValidationError`
 * message states.
 *
 * Each test gets its own workspace, same isolation rationale as
 * `ci-ingest.it.test.ts`: sharing a workspace across tests using
 * `MockGitHubClient` risks cross-contamination since the mock's PR/commit
 * bookkeeping (`openedPrs`, `committed`) is per-CLIENT-INSTANCE, not
 * per-installation, and route-level auth always resolves to whichever
 * workspace the test wired in.
 */
d('CI export (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(workspaceId: string, githubOpts: MockGitHubOptions = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(githubOpts),
        auth: new MockAuthProvider(undefined, { id: workspaceId, name: 'ci-export-ws' }),
      },
    });
  }

  let seq = 0;

  async function createWorkspace(): Promise<string> {
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: `ci-export-ws-${seq++}` }).returning();
    return ws!.id;
  }

  async function createAgent(workspaceId: string, name = `ci-export-agent-${seq++}`): Promise<string> {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'Review the diff.',
      })
      .returning();
    return agent!.id;
  }

  function exportBody(repo: string, overrides: Record<string, unknown> = {}) {
    return {
      repo,
      target: 'gha',
      action: 'open_pr',
      post_as: 'github_review',
      triggers: ['opened', 'synchronize'],
      base: 'main',
      ...overrides,
    };
  }

  describe('AC-5 — completing export commits the bundle and opens a PR', () => {
    it('returns 201, a real pr_url, a persisted installation row, and a real committed file set', async () => {
      const workspaceId = await createWorkspace();
      const agentId = await createAgent(workspaceId);
      const app = await makeApp(workspaceId);

      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/export-ci`,
        payload: exportBody('acme/target-export-1'),
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.pr_url).toMatch(/^https:\/\/github\.com\//);
      expect(body.installation).toBeTruthy();
      expect(body.installation.repo).toBe('acme/target-export-1');
      expect(body.installation.target_type).toBe('gha');
      expect(body.files.length).toBeGreaterThan(0);
      expect(body.refused_reason).toBeNull();

      const rows = await pg.handle.db
        .select()
        .from(t.ciInstallations)
        .where(eq(t.ciInstallations.workspaceId, workspaceId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.repo).toBe('acme/target-export-1');
      expect(rows[0]!.agentId).toBe(agentId);
      expect(rows[0]!.prUrl).toBe(body.pr_url);

      await app.close();
    });
  });

  describe('AC-7 — exporting twice for the same agent+repo reuses the installation', () => {
    it('first export is 201 (new installation), second is 200 (republish), exactly one installation row and one opened PR throughout', async () => {
      const workspaceId = await createWorkspace();
      const agentId = await createAgent(workspaceId);
      const app = await makeApp(workspaceId);
      const repo = 'acme/target-export-2';

      const first = await app.inject({ method: 'POST', url: `/agents/${agentId}/export-ci`, payload: exportBody(repo) });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({ method: 'POST', url: `/agents/${agentId}/export-ci`, payload: exportBody(repo) });
      expect(second.statusCode).toBe(200);
      expect(second.json().reused_pr).toBe(true);

      const rows = await pg.handle.db
        .select()
        .from(t.ciInstallations)
        .where(eq(t.ciInstallations.workspaceId, workspaceId));
      expect(rows).toHaveLength(1);

      await app.close();
    });
  });

  describe('AC-10a — a credential/write-access failure returns 422, not a 200 body', () => {
    it('returns 422 with a stated reason and writes zero installation rows', async () => {
      const workspaceId = await createWorkspace();
      const agentId = await createAgent(workspaceId);
      const app = await makeApp(workspaceId, { writeAccessDenied: true });

      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/export-ci`,
        payload: exportBody('acme/target-export-3'),
      });

      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error?.code ?? body.code).toBeDefined();
      expect(JSON.stringify(body)).toMatch(/could not write/i);

      const rows = await pg.handle.db
        .select()
        .from(t.ciInstallations)
        .where(eq(t.ciInstallations.workspaceId, workspaceId));
      expect(rows).toHaveLength(0);

      await app.close();
    });
  });

  describe('AC-59 — exporting a second, different agent into an already-installed repo is refused', () => {
    it('refuses with a stated reason, changes nothing, and leaves the original installation intact', async () => {
      const workspaceId = await createWorkspace();
      const agentOne = await createAgent(workspaceId, 'ci-export-agent-one');
      const agentTwo = await createAgent(workspaceId, 'ci-export-agent-two');
      const app = await makeApp(workspaceId);
      const repo = 'acme/target-export-4';

      const first = await app.inject({
        method: 'POST',
        url: `/agents/${agentOne}/export-ci`,
        payload: exportBody(repo),
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: 'POST',
        url: `/agents/${agentTwo}/export-ci`,
        payload: exportBody(repo),
      });
      expect(second.statusCode).toBe(200);
      const body = second.json();
      expect(body.installation).toBeNull();
      expect(body.refused_reason).toMatch(/already has a DevDigest CI installation/i);

      const rows = await pg.handle.db
        .select()
        .from(t.ciInstallations)
        .where(eq(t.ciInstallations.workspaceId, workspaceId));
      expect(rows).toHaveLength(1);
      // Still owned by the FIRST agent — the refusal changed nothing.
      expect(rows[0]!.agentId).toBe(agentOne);

      await app.close();
    });
  });

  describe('P-4 — GET /agents/:id/ci/preview/file', () => {
    it('returns a real file’s contents for a valid path, and 404s for an unrecognized one', async () => {
      const workspaceId = await createWorkspace();
      const agentId = await createAgent(workspaceId);
      const app = await makeApp(workspaceId);
      const qs = new URLSearchParams({
        repo: 'acme/target-export-5',
        target: 'gha',
        post_as: 'github_review',
        triggers: 'opened,synchronize',
        path: '.github/workflows/devdigest.yml',
      });

      const ok = await app.inject({ method: 'GET', url: `/agents/${agentId}/ci/preview/file?${qs.toString()}` });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().contents).toEqual(expect.any(String));

      const badQs = new URLSearchParams(qs);
      badQs.set('path', 'not/a/real/path.txt');
      const notFound = await app.inject({ method: 'GET', url: `/agents/${agentId}/ci/preview/file?${badQs.toString()}` });
      expect(notFound.statusCode).toBe(404);

      await app.close();
    });
  });
});
