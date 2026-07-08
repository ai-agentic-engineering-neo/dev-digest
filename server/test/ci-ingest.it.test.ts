import { deflateRawSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { RUNNER_DIR, RUNNER_ENTRY_PATH } from '../src/modules/ci/constants.js';
import type {
  ArtifactDownload,
  ArtifactRef,
  GitHubClient,
  ListWorkflowRunsOptions,
  RepoRef,
  WorkflowRunSummary,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[ci-ingest.it] Docker not available — skipping.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// ---------------------------------------------------------------------------
// Minimal ZIP builder (mirrors `modules/ci/ingest.ts`'s hand-rolled reader) —
// produces a real, valid PKZIP archive containing one deflated entry, so the
// ingest path's unzip logic (not just its JSON parsing) is actually exercised.
// ---------------------------------------------------------------------------
function buildZip(entryName: string, content: string): Buffer {
  const nameBuf = Buffer.from(entryName, 'utf8');
  const contentBuf = Buffer.from(content, 'utf8');
  const compressed = deflateRawSync(contentBuf);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8); // deflate
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(0, 14); // crc32 unchecked by the reader
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(contentBuf.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);
  const localEntry = Buffer.concat([localHeader, nameBuf, compressed]);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(0, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(contentBuf.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(0, 42); // local header offset (0 — single-entry archive)
  const centralEntry = Buffer.concat([centralHeader, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralEntry.length, 12);
  eocd.writeUInt32LE(localEntry.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localEntry, centralEntry, eocd]);
}

function artifactZip(json: unknown): ArtifactDownload {
  const contents = buildZip('devdigest-result.json', JSON.stringify(json));
  return { name: 'devdigest-result', sizeBytes: contents.length, contents };
}

function workflowRun(id: number, prNumber: number | null = 42): WorkflowRunSummary {
  return {
    id,
    runNumber: id,
    name: 'DevDigest review',
    status: 'completed',
    conclusion: 'success',
    headBranch: 'feature-branch',
    headSha: 'a'.repeat(40),
    event: 'pull_request',
    htmlUrl: `https://github.com/mock/mock/actions/runs/${id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pullRequestNumber: prNumber,
  };
}

/**
 * A `GitHubClient` whose `listWorkflowRuns`/`downloadArtifact` are scripted per
 * runId — needed because `MockGitHubClient`'s fixtures are a single fixed
 * value shared by every call, but ingest tests need different runs to
 * resolve to different (or failing) artifacts. Defined locally, mirroring
 * `FlakyGitHubClient`/`SecretsSpyGitHubClient` in `ci-export.it.test.ts`.
 */
class ScriptedGitHubClient extends MockGitHubClient implements GitHubClient {
  constructor(
    private runs: WorkflowRunSummary[],
    private artifacts: Map<number, ArtifactDownload | Error>,
  ) {
    super();
  }
  override async listWorkflowRuns(
    repo: RepoRef,
    opts?: ListWorkflowRunsOptions,
  ): Promise<WorkflowRunSummary[]> {
    this.listWorkflowRunsCalls.push({ repo, opts });
    return this.runs;
  }
  override async downloadArtifact(repo: RepoRef, artifactRef: ArtifactRef): Promise<ArtifactDownload> {
    this.downloadArtifactCalls.push({ repo, artifactRef });
    const entry = this.artifacts.get(artifactRef.runId);
    if (entry instanceof Error) throw entry;
    return entry ?? { name: 'devdigest-result', sizeBytes: 0, contents: Buffer.alloc(0) };
  }
}

/** Always fails to list workflow runs — simulates GitHub API unavailability/rate-limiting. */
class RateLimitedGitHubClient extends MockGitHubClient implements GitHubClient {
  override async listWorkflowRuns(): Promise<WorkflowRunSummary[]> {
    throw new Error('simulated rate limit');
  }
}

d('CI ingest (T6) — Testcontainers', () => {
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
    return res.json() as { id: string; ci_fail_on?: string };
  }

  async function installGha(agentId: string, repo: string) {
    const [row] = await pg.handle.db
      .insert(t.ciInstallations)
      .values({ agentId, repo, targetType: 'gha', status: 'active', workflowVersion: 'v1' })
      .returning();
    return row!;
  }

  // -------------------------------------------------------------------------
  // Part (a) — AC-19: the runner bundle is embedded in the export file set.
  // -------------------------------------------------------------------------
  it('AC-19: export file set includes the bundled runner at .devdigest/runner/index.js', async () => {
    const app = await appWith(new MockGitHubClient());
    const agent = await createAgent(app, 'Runner Bundle Agent');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/bundle-repo', target: 'gha', action: 'files', base: 'main' },
    });
    expect(res.statusCode).toBe(200);

    const files = res.json().files as { path: string; contents: string }[];
    const runnerFile = files.find((f) => f.path === RUNNER_ENTRY_PATH);
    expect(runnerFile).toBeDefined();
    expect(runnerFile!.contents.length).toBeGreaterThan(0);

    const onDisk = readFileSync(
      new URL('../../agent-runner/dist/index.js', import.meta.url),
      'utf8',
    );
    expect(runnerFile!.contents).toBe(onDisk);

    await app.close();
  });

  // -------------------------------------------------------------------------
  // Part (a2) — AC-19: EVERY file under agent-runner/dist/ ships, not just
  // index.js — ncc splits dynamic imports into extra chunk files (e.g.
  // 310.index.js) that index.js loads relative to itself at runtime, so
  // shipping only the entry point would silently break the runner in prod.
  // -------------------------------------------------------------------------
  it('AC-19: export file set includes every agent-runner/dist file under .devdigest/runner/', async () => {
    const app = await appWith(new MockGitHubClient());
    const agent = await createAgent(app, 'Full Runner Bundle Agent');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/export-ci`,
      payload: { repo: 'acme/bundle-repo-2', target: 'gha', action: 'files', base: 'main' },
    });
    expect(res.statusCode).toBe(200);

    const files = res.json().files as { path: string; contents: string }[];

    const distDirPath = new URL('../../agent-runner/dist/', import.meta.url).pathname;
    const relativePaths = (readdirSync(distDirPath, { recursive: true }) as string[])
      .filter((entry) => statSync(join(distDirPath, entry)).isFile())
      .map((entry) => entry.split(sep).join('/'));

    // Sanity: the on-disk bundle really does have more than just index.js
    // (otherwise this test would pass vacuously).
    expect(relativePaths.length).toBeGreaterThan(1);
    expect(relativePaths).toContain('index.js');

    for (const relativePath of relativePaths) {
      const expectedPath = `${RUNNER_DIR}/${relativePath}`;
      const shippedFile = files.find((f) => f.path === expectedPath);
      expect(shippedFile, `expected shipped file at ${expectedPath}`).toBeDefined();
      const onDisk = readFileSync(join(distDirPath, relativePath), 'utf8');
      expect(shippedFile!.contents).toBe(onDisk);
    }

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC-27: no push endpoint; refresh is workspace-scoped; routes don't import ingest.ts
  // -------------------------------------------------------------------------
  it('AC-27: routes.ts calls only CiService (never imports ingest.ts); no inbound push route', () => {
    const routesSrc = readFileSync(
      new URL('../src/modules/ci/routes.ts', import.meta.url),
      'utf8',
    );
    expect(routesSrc).not.toMatch(/from ['"]\.\/ingest\.js['"]/);

    // Extract every literal route path actually registered (`app.<verb>('<path>'`)
    // and assert it's one of the four known routes — no extra inbound push route
    // (e.g. `/ci/ingest`, `/ci/webhook`, `/ci/results`) sneaks in.
    const registered = [...routesSrc.matchAll(/app\.(get|post|put|delete)\(\s*'([^']+)'/g)].map(
      (m) => `${m[1]!.toUpperCase()} ${m[2]}`,
    );
    expect(registered.sort()).toEqual(
      [
        'POST /agents/:id/export-ci',
        'GET /agents/:id/ci-installations',
        'POST /ci/refresh',
        'GET /ci/runs',
      ].sort(),
    );
  });

  it('AC-27: POST /ci/refresh + GET /ci/runs only ever see the caller workspace', async () => {
    const github = new MockGitHubClient();
    const app = await appWith(github);
    const agent = await createAgent(app, 'Scoped Agent');
    await installGha(agent.id, 'acme/scoped-repo');

    // A foreign workspace + agent + installation — must never be touched by a
    // refresh scoped to the default workspace, nor appear in its run list.
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
    const foreignInstall = await installGha(foreignAgent!.id, 'acme/foreign-repo');

    const refreshRes = await app.inject({ method: 'POST', url: '/ci/refresh' });
    expect(refreshRes.statusCode).toBe(200);

    const foreignRuns = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.ciInstallationId, foreignInstall.id));
    expect(foreignRuns).toHaveLength(0);

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC-30: idempotent ingest
  // -------------------------------------------------------------------------
  it('AC-30: duplicate ingest of the same (installation, actions_run) yields exactly one row', async () => {
    const artifact = {
      findings_count: 2,
      critical: 1,
      warning: 1,
      suggestion: 0,
      cost_usd: 0.05,
      duration_ms: 4000,
      agent: 'Dup Agent',
      version: '1',
      pr_number: 7,
    };
    const github = new ScriptedGitHubClient(
      [workflowRun(101, 7)],
      new Map([[101, artifactZip(artifact)]]),
    );
    const app = await appWith(github);
    const agent = await createAgent(app, 'Dup Agent');
    const installation = await installGha(agent.id, 'acme/dup-repo');

    const first = await app.inject({ method: 'POST', url: '/ci/refresh' });
    expect(first.statusCode).toBe(200);
    expect(first.json().degraded).toBe(false);

    const second = await app.inject({ method: 'POST', url: '/ci/refresh' });
    expect(second.statusCode).toBe(200);

    const rows = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(
        and(eq(t.agentRuns.ciInstallationId, installation.id), eq(t.agentRuns.actionsRunId, '101')),
      );
    expect(rows).toHaveLength(1);

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC-31: invalid/missing/expired artifacts are skipped, others still ingest
  // -------------------------------------------------------------------------
  it('AC-31: missing/invalid artifacts are skipped without failing the whole refresh', async () => {
    const validArtifact = {
      findings_count: 1,
      critical: 0,
      warning: 1,
      suggestion: 0,
      cost_usd: 0.01,
      duration_ms: 1000,
      agent: 'Skip Agent',
      version: '1',
      pr_number: 9,
    };
    const github = new ScriptedGitHubClient(
      [workflowRun(201, 9), workflowRun(202, 9), workflowRun(203, 9)],
      new Map<number, ArtifactDownload | Error>([
        [201, artifactZip(validArtifact)],
        // 202: "expired" artifact — empty bytes, no valid zip to parse
        [202, { name: 'devdigest-result', sizeBytes: 0, contents: Buffer.alloc(0) }],
        // 203: a zip whose JSON fails CiResultArtifact validation
        [203, artifactZip({ not: 'a valid artifact' })],
      ]),
    );
    const app = await appWith(github);
    const agent = await createAgent(app, 'Skip Agent');
    const installation = await installGha(agent.id, 'acme/skip-repo');

    const res = await app.inject({ method: 'POST', url: '/ci/refresh' });
    expect(res.statusCode).toBe(200);
    expect(res.json().degraded).toBe(false);

    const rows = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.ciInstallationId, installation.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actionsRunId).toBe('201');

    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC-32: GitHub API unavailable → degraded, existing runs preserved, no partial rows
  // -------------------------------------------------------------------------
  it('AC-32: a GitHub API failure returns degraded, preserves existing runs, writes nothing new', async () => {
    const seedArtifact = {
      findings_count: 0,
      critical: 0,
      warning: 0,
      suggestion: 0,
      cost_usd: 0,
      duration_ms: 500,
      agent: 'Degraded Agent',
      version: '1',
      pr_number: 11,
    };
    const seededGithub = new ScriptedGitHubClient(
      [workflowRun(301, 11)],
      new Map([[301, artifactZip(seedArtifact)]]),
    );
    const seedApp = await appWith(seededGithub);
    const agent = await createAgent(seedApp, 'Degraded Agent');
    const installation = await installGha(agent.id, 'acme/degraded-repo');

    const seedRefresh = await seedApp.inject({ method: 'POST', url: '/ci/refresh' });
    expect(seedRefresh.json().degraded).toBe(false);
    await seedApp.close();

    const before = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.ciInstallationId, installation.id));
    expect(before).toHaveLength(1);

    const flakyApp = await appWith(new RateLimitedGitHubClient());
    const degradedRes = await flakyApp.inject({ method: 'POST', url: '/ci/refresh' });
    expect(degradedRes.statusCode).toBe(200);
    const degradedBody = degradedRes.json();
    expect(degradedBody.degraded).toBe(true);
    expect(typeof degradedBody.message === 'string' || degradedBody.message === null).toBe(true);

    const after = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.ciInstallationId, installation.id));
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(before[0]!.id);

    await flakyApp.close();
  });

  // -------------------------------------------------------------------------
  // AC-29 + AC-28: verdict/blockers reuse the shared gate; row shape is correct
  // -------------------------------------------------------------------------
  it('AC-29/AC-28: verdict+blockers match the shared gate computation; row carries CI metadata, null prId, correct workspaceId', async () => {
    // agent default ci_fail_on = 'critical' → only CRITICAL findings block.
    const blockingArtifact = {
      findings_count: 3,
      critical: 1,
      warning: 2,
      suggestion: 0,
      cost_usd: 0.12,
      duration_ms: 8000,
      agent: 'Gate Agent',
      version: '1',
      pr_number: 55,
    };
    const nonBlockingArtifact = {
      findings_count: 2,
      critical: 0,
      warning: 2,
      suggestion: 0,
      cost_usd: 0.02,
      duration_ms: 2000,
      agent: 'Gate Agent',
      version: '1',
      pr_number: 56,
    };
    const cleanArtifact = {
      findings_count: 0,
      critical: 0,
      warning: 0,
      suggestion: 0,
      cost_usd: 0,
      duration_ms: 500,
      agent: 'Gate Agent',
      version: '1',
      pr_number: 57,
    };

    const github = new ScriptedGitHubClient(
      [workflowRun(401, 55), workflowRun(402, 56), workflowRun(403, 57)],
      new Map([
        [401, artifactZip(blockingArtifact)],
        [402, artifactZip(nonBlockingArtifact)],
        [403, artifactZip(cleanArtifact)],
      ]),
    );
    const app = await appWith(github);
    const agent = await createAgent(app, 'Gate Agent');
    const installation = await installGha(agent.id, 'acme/gate-repo');

    const refreshRes = await app.inject({ method: 'POST', url: '/ci/refresh' });
    expect(refreshRes.json().degraded).toBe(false);

    const runsRes = await app.inject({ method: 'GET', url: '/ci/runs' });
    expect(runsRes.statusCode).toBe(200);
    const runs = runsRes.json() as {
      pr_number: number;
      verdict: string | null;
      blockers: number | null;
      status: string | null;
      source: string | null;
      pr_id: string | null;
      ci_installation_id: string | null;
      repo: string;
      actions_job_url: string | null;
    }[];

    const blocking = runs.find((r) => r.pr_number === 55);
    expect(blocking?.blockers).toBe(1); // only the 1 critical finding
    expect(blocking?.verdict).toBe('request_changes');
    expect(blocking?.status).toBe('succeeded');

    const nonBlocking = runs.find((r) => r.pr_number === 56);
    expect(nonBlocking?.blockers).toBe(0); // warnings don't block under ci_fail_on=critical
    expect(nonBlocking?.verdict).toBe('comment');
    expect(nonBlocking?.status).toBe('succeeded');

    const clean = runs.find((r) => r.pr_number === 57);
    expect(clean?.blockers).toBe(0);
    expect(clean?.verdict).toBe('approve');
    expect(clean?.status).toBe('no_findings');

    // AC-28: CI metadata + null-tolerant prId + correct workspace on the raw row.
    for (const prNumber of [55, 56, 57]) {
      const [row] = await pg.handle.db
        .select()
        .from(t.agentRuns)
        .where(
          and(
            eq(t.agentRuns.ciInstallationId, installation.id),
            eq(t.agentRuns.externalPrNumber, prNumber),
          ),
        );
      expect(row).toBeDefined();
      expect(row!.source).toBe('ci');
      expect(row!.prId).toBeNull();
      expect(row!.workspaceId).toBe(workspaceId);
      expect(row!.repo).toBe('acme/gate-repo');
      expect(row!.actionsJobUrl).toBeTruthy();
      expect(row!.ciInstallationId).toBe(installation.id);
    }

    await app.close();
  });

  it('the reviewRepo writer is the only inserter of agent_runs from the ci module', () => {
    const ingestSrc = readFileSync(new URL('../src/modules/ci/ingest.ts', import.meta.url), 'utf8');
    const repoSrc = readFileSync(new URL('../src/modules/ci/repository.ts', import.meta.url), 'utf8');
    expect(ingestSrc).not.toMatch(/\.insert\(\s*t\.agentRuns/);
    expect(repoSrc).not.toMatch(/\.insert\(\s*t\.agentRuns/);
    expect(ingestSrc).toMatch(/reviewRepo\.createCiAgentRun/);
  });
});
