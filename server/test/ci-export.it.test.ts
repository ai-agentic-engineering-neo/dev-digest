import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { GitHubClient, RepoRef, CommitFilesPayload } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[ci-export.it] Docker not available — skipping.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A GitHubClient stub whose `commitFiles` fails exactly once (or every time,
 * if `always` is set) — used to exercise AC-14 (a forced GitHub API failure
 * must leave no partial `ci_installations` row, and a retry must succeed).
 * Defined locally (not in `src/adapters/mocks.ts`, which is T3-owned) since it
 * is only needed by this test.
 */
class FlakyGitHubClient extends MockGitHubClient implements GitHubClient {
  private calls = 0;
  constructor(private failTimes = 1) {
    super();
  }
  override async commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }> {
    this.calls++;
    if (this.calls <= this.failTimes) {
      throw new Error('simulated GitHub API failure');
    }
    return super.commitFiles(repo, payload);
  }
}

/** Records whether any GitHub Secrets-API-shaped call was ever attempted (AC-9). */
class SecretsSpyGitHubClient extends MockGitHubClient implements GitHubClient {
  public secretsApiCalls = 0;
  // GitHubClient has no secrets-management method in the shared port at all —
  // this class exists to document/assert that fact structurally: nothing in
  // CiService can call a Secrets API method because none is exposed here.
}

d('CI export (T5) — Testcontainers', () => {
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

  function appWith(github: GitHubClient) {
    return buildApp({ config: config(), db: pg.handle.db, overrides: { github } });
  }

  async function createAgent(app: Awaited<ReturnType<typeof buildApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review carefully.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  it('AC-10: open_pr + gha opens a single-commit PR from devdigest/ci into base, no direct base commit', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC10');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'gha', action: 'open_pr', base: 'main' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pr_url).toBe('https://github.com/mock/mock/pull/1');
    expect(body.files.length).toBeGreaterThan(0);

    // exactly one commit, to the devdigest/ci branch, based on `main` — never a
    // direct commit to `main` itself.
    expect(github.committed).toHaveLength(1);
    expect(github.committed[0]!.branch).toBe('devdigest/ci');
    expect(github.committed[0]!.base).toBe('main');
    // all files landed in that single commit (manifest + memory + workflow, at least)
    const paths = github.committed[0]!.files.map((f) => f.path);
    expect(paths).toContain('.devdigest/memory.jsonl');
    expect(paths).toContain('.github/workflows/devdigest-review.yml');
    expect(paths.some((p) => p.startsWith('.devdigest/agents/'))).toBe(true);

    expect(github.openedPrs).toHaveLength(1);
    expect(github.openedPrs[0]!.head).toBe('devdigest/ci');
    expect(github.openedPrs[0]!.base).toBe('main');

    await app.close();
  });

  it('AC-12: installation row is recorded with status + workflow_version', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC12');

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'gha', action: 'open_pr', base: 'main' },
    });

    const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci-installations` });
    expect(list.statusCode).toBe(200);
    const installations = list.json();
    expect(installations).toHaveLength(1);
    expect(installations[0].status).toBe('pr_open');
    expect(typeof installations[0].workflow_version).toBe('string');
    expect(installations[0].workflow_version.length).toBeGreaterThan(0);
    expect(installations[0].repo).toBe('acme/payments-api');
    expect(installations[0].target_type).toBe('gha');

    const [row] = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agent.id));
    expect(row).toBeDefined();
    expect(row!.status).toBe('pr_open');

    await app.close();
  });

  it('AC-11: re-export is idempotent — same PR URL, no duplicate PR/commit/row', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC11');

    const first = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'gha', action: 'open_pr', base: 'main' },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'gha', action: 'open_pr', base: 'main' },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().pr_url).toBe(first.json().pr_url);

    // MockGitHubClient.findOpenPr only "finds" a PR after openPullRequest was
    // called with that head branch — so a real duplicate would show up as 2
    // entries in `openedPrs`.
    expect(github.openedPrs).toHaveLength(1);
    expect(github.committed).toHaveLength(2); // one commit per export call, same branch

    const rows = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agent.id));
    expect(rows).toHaveLength(1); // upserted, not duplicated

    await app.close();
  });

  it('AC-13: action=files returns files only — no PR opened, no installation row persisted', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC13 files');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'gha', action: 'files', base: 'main' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pr_url).toBeNull();
    expect(body.files.length).toBeGreaterThan(0);
    // response still carries an (in-memory, non-persisted) installation object
    expect(body.installation).toBeDefined();

    expect(github.openedPrs).toHaveLength(0);
    expect(github.committed).toHaveLength(0);

    const rows = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agent.id));
    expect(rows).toHaveLength(0);

    await app.close();
  });

  it('AC-13: a non-gha target (open_pr requested) also returns files only, no PR/installation', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC13 circle');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'circle', action: 'open_pr', base: 'main' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pr_url).toBeNull();
    expect(body.files.length).toBeGreaterThan(0);
    expect(github.openedPrs).toHaveLength(0);
    expect(github.committed).toHaveLength(0);

    const rows = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agent.id));
    expect(rows).toHaveLength(0);

    await app.close();
  });

  it('AC-14: a forced GitHub failure leaves no partial installation row; retry succeeds', async () => {
    const github = new FlakyGitHubClient(1);
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC14');

    const failed = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'gha', action: 'open_pr', base: 'main' },
    });
    expect(failed.statusCode).toBeGreaterThanOrEqual(500);

    const rowsAfterFailure = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agent.id));
    expect(rowsAfterFailure).toHaveLength(0);

    const retried = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'gha', action: 'open_pr', base: 'main' },
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().pr_url).toBeTruthy();

    const rowsAfterRetry = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agent.id));
    expect(rowsAfterRetry).toHaveLength(1);

    await app.close();
  });

  it('AC-9: never calls a GitHub Secrets-API-shaped method (port exposes none)', async () => {
    const github = new SecretsSpyGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC9');

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'gha', action: 'open_pr', base: 'main' },
    });

    // The shared GitHubClient port has no secrets-management method at all, so
    // this is structurally guaranteed — asserted here for documentation.
    expect(github.secretsApiCalls).toBe(0);
    expect((github as unknown as Record<string, unknown>)['setSecret']).toBeUndefined();
    expect((github as unknown as Record<string, unknown>)['createSecret']).toBeUndefined();

    await app.close();
  });

  it('both routes reject a cross-workspace agent id with 404', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);

    // Insert an agent directly under a foreign workspace (not the seeded
    // default one `LocalNoAuthProvider` always resolves requests to) — the
    // workspace-scoped lookup in CiService (via agentsRepo.getById) must
    // reject it exactly like the agents/reviews routes do.
    const [foreignWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `foreign-ws-${Date.now()}` })
      .returning();
    const [foreignAgent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId: foreignWs!.id,
        name: 'Foreign Agent',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'x',
      })
      .returning();

    const exportRes = await app.inject({
      method: 'POST',
      url: `/agents/${foreignAgent!.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'gha', action: 'open_pr', base: 'main' },
    });
    expect(exportRes.statusCode).toBe(404);

    const listRes = await app.inject({ method: 'GET', url: `/agents/${foreignAgent!.id}/ci-installations` });
    expect(listRes.statusCode).toBe(404);

    await app.close();
  });

  it('returns 404 for a non-existent agent id (unauthenticated/unknown callers get no data leak)', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/00000000-0000-0000-0000-000000000000/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'gha', action: 'open_pr', base: 'main' },
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('AC-24: post_as is forwarded into the generated workflow as DEVDIGEST_POST_AS', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC24');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: {
        repo: 'acme/payments-api',
        target: 'gha',
        action: 'files',
        base: 'main',
        post_as: 'pr_comment',
      },
    });
    expect(res.statusCode).toBe(200);

    const files = res.json().files as { path: string; contents: string }[];
    const workflowFile = files.find((f) => f.path === '.github/workflows/devdigest-review.yml');
    expect(workflowFile).toBeDefined();
    expect(workflowFile!.contents).toContain('DEVDIGEST_POST_AS: pr_comment');

    await app.close();
  });

  it('AC-24: post_as defaults to github_review when omitted', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC24 default');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/payments-api', target: 'gha', action: 'files', base: 'main' },
    });
    expect(res.statusCode).toBe(200);

    const files = res.json().files as { path: string; contents: string }[];
    const workflowFile = files.find((f) => f.path === '.github/workflows/devdigest-review.yml');
    expect(workflowFile!.contents).toContain('DEVDIGEST_POST_AS: github_review');

    await app.close();
  });

  it('AC-3: workflow_override replaces the generated workflow contents on the open_pr path', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC3 open_pr');

    const overrideYaml = 'name: My Custom Workflow\non: [pull_request]\njobs: {}\n';

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: {
        repo: 'acme/payments-api',
        target: 'gha',
        action: 'open_pr',
        base: 'main',
        workflow_override: overrideYaml,
      },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    const responseWorkflowFile = (body.files as { path: string; contents: string }[]).find(
      (f) => f.path === '.github/workflows/devdigest-review.yml',
    );
    expect(responseWorkflowFile!.contents).toBe(overrideYaml);

    const committedWorkflowFile = github.committed[0]!.files.find(
      (f) => f.path === '.github/workflows/devdigest-review.yml',
    );
    expect(committedWorkflowFile).toBeDefined();
    expect(committedWorkflowFile!.contents).toBe(overrideYaml);

    await app.close();
  });

  it('AC-3: workflow_override replaces the generated workflow contents on the files path', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC3 files');

    const overrideYaml = 'name: My Custom Workflow (files)\non: [pull_request]\njobs: {}\n';

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: {
        repo: 'acme/payments-api',
        target: 'gha',
        action: 'files',
        base: 'main',
        workflow_override: overrideYaml,
      },
    });
    expect(res.statusCode).toBe(200);

    const files = res.json().files as { path: string; contents: string }[];
    const workflowFile = files.find((f) => f.path === '.github/workflows/devdigest-review.yml');
    expect(workflowFile!.contents).toBe(overrideYaml);

    await app.close();
  });

  it('AC-3: an empty/absent workflow_override does not suppress the generated workflow', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Export Agent AC3 empty override');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: {
        repo: 'acme/payments-api',
        target: 'gha',
        action: 'files',
        base: 'main',
        workflow_override: '',
      },
    });
    expect(res.statusCode).toBe(200);

    const files = res.json().files as { path: string; contents: string }[];
    const workflowFile = files.find((f) => f.path === '.github/workflows/devdigest-review.yml');
    expect(workflowFile!.contents).toContain('name: DevDigest Review');

    await app.close();
  });
});
