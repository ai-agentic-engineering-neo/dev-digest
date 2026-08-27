import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import * as t from '../src/db/schema.js';
import { MockAuthProvider, MockGitClient, MockGitHubClient, type MockGitHubOptions } from '../src/adapters/mocks.js';
import { CiRepository } from '../src/modules/ci/repository.js';
import { RESULT_FILENAME, RUN_META_FILENAME } from '../src/modules/ci/constants.js';
import type { WorkflowRun, RunArtifact } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-ingest] Docker not available — skipping integration tests.');
}

/**
 * specs/14-export-to-ci.md (Phase D) — the untrusted-artifact boundary
 * (AC-18/AC-63), idempotent upsert (AC-19), and the paired `agent_runs`
 * (source='ci') + `run_traces` writes (D7/AC-20/AC-30), all exercised through
 * the REAL `POST /ci/refresh` route against a stubbed `GitHubClient`
 * (`MockGitHubClient`) — never a real network call.
 *
 * Each test gets its own workspace (`createWorkspace`), never the shared
 * seeded one: `CiService.refresh` iterates EVERY installation in a workspace,
 * and `MockGitHubClient.listWorkflowRuns`/`listRunArtifacts` ignore the `repo`
 * argument entirely (they return whatever fixture the CURRENT test scripted,
 * regardless of which installation is being refreshed) — so two tests
 * sharing one workspace would cross-contaminate each other's runs the moment
 * more than one installation exists in it. Per-test isolation sidesteps that
 * without needing a smarter mock.
 */
d('CI ingest (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /**
   * `getContext` (every route) resolves the workspace through
   * `container.auth.currentWorkspace()`, never from a request param — the
   * DEFAULT provider (`LocalNoAuthProvider`) always resolves the ONE seeded
   * workspace, so a per-test workspace can only be reached over the real HTTP
   * route by overriding `auth` to point at it explicitly.
   */
  function makeApp(workspaceId: string, githubOpts: MockGitHubOptions = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(githubOpts),
        auth: new MockAuthProvider(undefined, { id: workspaceId, name: 'ci-ingest-ws' }),
      },
    });
  }

  let seq = 0;

  async function createWorkspace(): Promise<string> {
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: `ci-ingest-ws-${seq++}` }).returning();
    return ws!.id;
  }

  async function createAgent(workspaceId: string): Promise<string> {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: `ci-ingest-agent-${seq++}`,
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'Review the diff.',
      })
      .returning();
    return agent!.id;
  }

  async function createInstallation(workspaceId: string, agentId: string, repo: string) {
    const ciRepo = new CiRepository(pg.handle.db);
    return ciRepo.insertInstallation({
      workspaceId,
      agentId,
      repo,
      targetType: 'gha',
      branch: 'devdigest/ci',
      base: 'main',
      workflowPath: '.github/workflows/devdigest.yml',
      postAs: 'github_review',
      triggers: ['opened', 'synchronize'],
    });
  }

  /** Fresh workspace + agent + installation for one test's exclusive use. */
  async function setUpFixture(repo: string) {
    const workspaceId = await createWorkspace();
    const agentId = await createAgent(workspaceId);
    const installation = await createInstallation(workspaceId, agentId, repo);
    return { workspaceId, agentId, installation };
  }

  const RUN_ID = 1001;
  const ARTIFACT_ID = 5001;

  function workflowRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
    return {
      id: RUN_ID,
      status: 'completed',
      conclusion: null,
      head_sha: 'commit-abc',
      html_url: `https://github.com/acme/target/actions/runs/${RUN_ID}`,
      display_title: 'DevDigest Review',
      created_at: '2026-08-20T00:00:00Z',
      updated_at: '2026-08-20T00:05:00Z',
      run_started_at: '2026-08-20T00:00:10Z',
      pull_requests: [42],
      ...overrides,
    };
  }

  function runArtifact(overrides: Partial<RunArtifact> = {}): RunArtifact {
    return { id: ARTIFACT_ID, name: 'devdigest-result', size_in_bytes: 512, expired: false, ...overrides };
  }

  /** Builds a real artifact zip carrying both the runner's result document and
   *  the D-P2 sidecar the generated workflow writes — matching exactly what
   *  `checkIngestArtifact` expects to unzip. */
  function buildArtifactZip(opts: {
    result?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    repo: string;
  }): Uint8Array {
    const result = {
      findings_count: 2,
      critical: 1,
      warning: 1,
      suggestion: 0,
      cost_usd: 0.05,
      duration_ms: 4200,
      agent: 'ci-ingest-agent',
      version: '1.0.0',
      pr_number: 42,
      ...opts.result,
    };
    const meta = {
      commit_sha: 'commit-abc',
      repository: opts.repo,
      pr_number: 42,
      ...opts.meta,
    };
    return zipSync({
      [RESULT_FILENAME]: strToU8(JSON.stringify(result)),
      [RUN_META_FILENAME]: strToU8(JSON.stringify(meta)),
    });
  }

  describe('AC-18 — the untrusted-artifact boundary rejects a mismatched envelope', () => {
    it('rejects a commit mismatch: envelope.commit != the provider run head_sha, no counts stored', async () => {
      const repo = 'acme/target-1';
      const { workspaceId, installation } = await setUpFixture(repo);
      const zipBytes = buildArtifactZip({ repo, meta: { commit_sha: 'a-different-commit' } });

      const app = await makeApp(workspaceId, {
        workflowRuns: [workflowRun()],
        runArtifacts: { [RUN_ID]: [runArtifact()] },
        artifactBytes: { [ARTIFACT_ID]: zipBytes },
      });

      const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { force: true } });
      expect(res.statusCode).toBe(200);

      const rows = await pg.handle.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.ciInstallationId, installation.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('failed');
      expect(rows[0]!.failureReason).toBe('commit_mismatch');
      expect(rows[0]!.findingsCount).toBeNull();
      expect(rows[0]!.critical).toBeNull();

      await app.close();
    });

    it('rejects a repository mismatch: envelope.repository != the installation repo', async () => {
      const repo = 'acme/target-2';
      const { workspaceId, installation } = await setUpFixture(repo);
      const zipBytes = buildArtifactZip({ repo, meta: { repository: 'someone-else/other-repo' } });

      const app = await makeApp(workspaceId, {
        workflowRuns: [workflowRun()],
        runArtifacts: { [RUN_ID]: [runArtifact()] },
        artifactBytes: { [ARTIFACT_ID]: zipBytes },
      });

      const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { force: true } });
      expect(res.statusCode).toBe(200);

      const rows = await pg.handle.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.ciInstallationId, installation.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('failed');
      expect(rows[0]!.failureReason).toBe('repository_mismatch');
      expect(rows[0]!.findingsCount).toBeNull();

      await app.close();
    });

    it('rejects a document that fails schema conformance (non-integer findings count)', async () => {
      const repo = 'acme/target-3';
      const { workspaceId, installation } = await setUpFixture(repo);
      // `findings_count` must be an integer per CiResultArtifact — a float fails safeParse.
      const zipBytes = buildArtifactZip({ repo, result: { findings_count: 2.5 } });

      const app = await makeApp(workspaceId, {
        workflowRuns: [workflowRun()],
        runArtifacts: { [RUN_ID]: [runArtifact()] },
        artifactBytes: { [ARTIFACT_ID]: zipBytes },
      });

      const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { force: true } });
      expect(res.statusCode).toBe(200);

      const rows = await pg.handle.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.ciInstallationId, installation.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('failed');
      expect(rows[0]!.failureReason).toContain('schema_conformance');
      expect(rows[0]!.findingsCount).toBeNull();

      await app.close();
    });

    it('a missing/unparseable envelope fails the commit check rather than passing vacuously', async () => {
      const repo = 'acme/target-4';
      const { workspaceId, installation } = await setUpFixture(repo);
      // Zip carries ONLY the result document — no devdigest-run.json sidecar at all.
      const zipBytes = zipSync({
        [RESULT_FILENAME]: strToU8(
          JSON.stringify({
            findings_count: 1,
            critical: 0,
            warning: 1,
            suggestion: 0,
            cost_usd: 0.01,
            duration_ms: 100,
            agent: 'a',
            pr_number: 42,
          }),
        ),
      });

      const app = await makeApp(workspaceId, {
        workflowRuns: [workflowRun()],
        runArtifacts: { [RUN_ID]: [runArtifact()] },
        artifactBytes: { [ARTIFACT_ID]: zipBytes },
      });

      const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { force: true } });
      expect(res.statusCode).toBe(200);

      const rows = await pg.handle.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.ciInstallationId, installation.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('failed');
      expect(rows[0]!.failureReason).toContain('schema_conformance');

      await app.close();
    });
  });

  describe('AC-63 — a credential-shaped value anywhere in the artifact is rejected, never stored', () => {
    it('rejects an artifact whose agent name field contains an OpenAI/OpenRouter-shaped key', async () => {
      const repo = 'acme/target-5';
      const { workspaceId, installation } = await setUpFixture(repo);
      const secret = 'sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const zipBytes = buildArtifactZip({ repo, result: { agent: secret } });

      const app = await makeApp(workspaceId, {
        workflowRuns: [workflowRun()],
        runArtifacts: { [RUN_ID]: [runArtifact()] },
        artifactBytes: { [ARTIFACT_ID]: zipBytes },
      });

      const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { force: true } });
      expect(res.statusCode).toBe(200);

      const rows = await pg.handle.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.ciInstallationId, installation.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('failed');
      expect(rows[0]!.failureReason).toBe('credential_shaped_value');
      // The value itself must appear in NO stored row, NO field, anywhere.
      expect(JSON.stringify(rows[0])).not.toContain(secret);
      expect(rows[0]!.agentName).not.toBe(secret);

      const listRes = await app.inject({ method: 'GET', url: '/ci/runs' });
      expect(JSON.stringify(listRes.json())).not.toContain(secret);

      await app.close();
    });
  });

  describe('AC-19 — idempotent upsert across repeated refreshes', () => {
    it('refreshing three times over one completed provider run yields exactly one ci_runs row', async () => {
      const repo = 'acme/target-6';
      const { workspaceId, installation } = await setUpFixture(repo);
      const zipBytes = buildArtifactZip({ repo });

      const app = await makeApp(workspaceId, {
        workflowRuns: [workflowRun()],
        runArtifacts: { [RUN_ID]: [runArtifact()] },
        artifactBytes: { [ARTIFACT_ID]: zipBytes },
      });

      for (let i = 0; i < 3; i++) {
        const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { force: true } });
        expect(res.statusCode).toBe(200);
      }

      const runRows = await pg.handle.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.ciInstallationId, installation.id));
      expect(runRows).toHaveLength(1);

      const agentRunRows = await pg.handle.db
        .select()
        .from(t.agentRuns)
        .where(eq(t.agentRuns.id, runRows[0]!.agentRunId!));
      expect(agentRunRows).toHaveLength(1);

      await app.close();
    });
  });

  describe("agent_runs (source='ci') + run_traces writes (D7/AC-20/AC-30)", () => {
    it("a successful ingest writes one ci_runs row, one agent_runs row with source='ci', and one run_traces row", async () => {
      const repo = 'acme/target-7';
      const { workspaceId, installation, agentId } = await setUpFixture(repo);
      const zipBytes = buildArtifactZip({ repo });

      const app = await makeApp(workspaceId, {
        workflowRuns: [workflowRun()],
        runArtifacts: { [RUN_ID]: [runArtifact()] },
        artifactBytes: { [ARTIFACT_ID]: zipBytes },
      });

      const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { force: true } });
      expect(res.statusCode).toBe(200);
      expect(res.json().ingested).toBe(1);

      const [runRow] = await pg.handle.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.ciInstallationId, installation.id));
      expect(runRow).toBeDefined();
      expect(runRow!.status).toBe('succeeded');
      expect(runRow!.findingsCount).toBe(2);
      expect(runRow!.agentRunId).toBeTruthy();

      const [agentRunRow] = await pg.handle.db
        .select()
        .from(t.agentRuns)
        .where(eq(t.agentRuns.id, runRow!.agentRunId!));
      expect(agentRunRow).toBeDefined();
      expect(agentRunRow!.source).toBe('ci');
      expect(agentRunRow!.status).toBe('done');
      expect(agentRunRow!.agentId).toBe(agentId);
      expect(agentRunRow!.findingsCount).toBe(2);

      const [traceRow] = await pg.handle.db
        .select()
        .from(t.runTraces)
        .where(eq(t.runTraces.runId, agentRunRow!.id));
      expect(traceRow).toBeDefined();
      const trace = traceRow!.trace as { config: { source: string }; stats: { findings: number } };
      expect(trace.config.source).toBe('ci');
      expect(trace.stats.findings).toBe(2);

      await app.close();
    });

    it('a run with no artifact published still writes a failed ci_runs row and an agent_runs row (AC-21)', async () => {
      const repo = 'acme/target-8';
      const { workspaceId, installation } = await setUpFixture(repo);

      const app = await makeApp(workspaceId, {
        workflowRuns: [workflowRun()],
        runArtifacts: { [RUN_ID]: [] }, // completed, but published no artifact
      });

      const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { force: true } });
      expect(res.statusCode).toBe(200);

      const [runRow] = await pg.handle.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.ciInstallationId, installation.id));
      expect(runRow).toBeDefined();
      expect(runRow!.status).toBe('failed');
      expect(runRow!.failureReason).toBe('no_artifact_published');
      expect(runRow!.findingsCount).toBeNull();

      const [agentRunRow] = await pg.handle.db
        .select()
        .from(t.agentRuns)
        .where(eq(t.agentRuns.id, runRow!.agentRunId!));
      expect(agentRunRow!.source).toBe('ci');
      expect(agentRunRow!.status).toBe('failed');

      await app.close();
    });
  });

  describe('AC-24 — workspace scoping on refresh/read', () => {
    it("refreshing one workspace never ingests or reads another workspace's installation", async () => {
      const otherRepo = 'other/repo';
      const { workspaceId: otherWs } = await setUpFixture(otherRepo);

      const repo = 'acme/target-9';
      const { workspaceId, installation } = await setUpFixture(repo);

      const app = await makeApp(workspaceId, {
        workflowRuns: [workflowRun()],
        runArtifacts: { [RUN_ID]: [runArtifact()] },
        artifactBytes: { [ARTIFACT_ID]: buildArtifactZip({ repo }) },
      });

      // Refresh runs for OUR workspace only; the other workspace's
      // installation must be untouched (zero rows for it).
      await app.inject({ method: 'POST', url: '/ci/refresh', payload: { force: true } });

      const otherWsRuns = await pg.handle.db.select().from(t.ciRuns).where(eq(t.ciRuns.workspaceId, otherWs));
      expect(otherWsRuns).toHaveLength(0);

      const ourWsRuns = await pg.handle.db.select().from(t.ciRuns).where(eq(t.ciRuns.workspaceId, workspaceId));
      expect(ourWsRuns).toHaveLength(1);
      expect(ourWsRuns[0]!.ciInstallationId).toBe(installation.id);

      await app.close();
    });
  });
});
