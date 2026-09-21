/**
 * `GET /agents` returns `AgentListItem[]` — each Agent plus the grid aggregates
 * (`skill_count`, `runs`, `accept_rate` 0-100, `avg_cost_usd`) computed by
 * `AgentsRepository.statsForAgents` in three batched queries. Gated on Docker
 * (needs Postgres), matching the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-stats] Docker not available — skipping integration tests.');
}

type Db = PgFixture['handle']['db'];

let seq = 0;
async function makePr(db: Db, workspaceId: string) {
  const name = `agstats-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'PR',
      author: 'marisa.koch',
      branch: 'feat/x',
      base: 'main',
      headSha: 'headsha',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  return pr!;
}

/** One agent run (+ review + one finding per `decisions` entry). */
async function addRun(
  db: Db,
  opts: {
    workspaceId: string;
    agentId: string;
    prId: string;
    status: 'done' | 'failed';
    costUsd: number | null;
    decisions?: Array<'accepted' | 'dismissed' | 'open'>;
  },
) {
  const [run] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: opts.workspaceId,
      agentId: opts.agentId,
      prId: opts.prId,
      provider: 'openrouter',
      model: 'gpt-4.1',
      status: opts.status,
      costUsd: opts.costUsd,
    })
    .returning();
  if (!opts.decisions?.length) return run!;
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId: opts.workspaceId,
      prId: opts.prId,
      agentId: opts.agentId,
      runId: run!.id,
      kind: 'review',
      verdict: 'approve',
      summary: 's',
      score: 90,
      model: 'gpt-4.1',
    })
    .returning();
  await db.insert(t.findings).values(
    opts.decisions.map((decision, i) => ({
      reviewId: review!.id,
      file: 'src/foo.ts',
      startLine: i + 1,
      endLine: i + 1,
      severity: 'WARNING',
      category: 'bug',
      title: `finding ${i}`,
      rationale: 'because',
      confidence: 0.9,
      acceptedAt: decision === 'accepted' ? new Date() : null,
      dismissedAt: decision === 'dismissed' ? new Date() : null,
    })),
  );
  return run!;
}

d('GET /agents — AgentListItem stats (Testcontainers pg)', () => {
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

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function listItem(app: Awaited<ReturnType<typeof makeApp>>, id: string) {
    const res = await app.inject({ method: 'GET', url: '/agents' });
    expect(res.statusCode).toBe(200);
    return (res.json() as Array<Record<string, unknown>>).find((a) => a.id === id)!;
  }

  it('a brand-new agent has zeroed stats and null rate/cost', async () => {
    const app = await makeApp();
    const id = await createAgent(app, 'Stats Zero');
    const item = await listItem(app, id);
    expect(item).toMatchObject({
      name: 'Stats Zero',
      skill_count: 0,
      runs: 0,
      accept_rate: null,
      avg_cost_usd: null,
    });
    await app.close();
  });

  it('aggregates skills, done runs, accept-rate and average cost per agent', async () => {
    const app = await makeApp();
    const db = pg.handle.db;
    const a = await createAgent(app, 'Stats A');
    const b = await createAgent(app, 'Stats B');
    const pr = await makePr(db, workspaceId);

    // Skills: A links 2, B links 1.
    const skills = await db
      .insert(t.skills)
      .values(
        ['sa-1', 'sa-2', 'sb-1'].map((name) => ({
          workspaceId,
          name,
          description: name,
          type: 'rubric' as const,
          source: 'manual' as const,
          body: '# rule',
        })),
      )
      .returning();
    await db.insert(t.agentSkills).values([
      { agentId: a, skillId: skills[0]!.id, order: 0 },
      { agentId: a, skillId: skills[1]!.id, order: 1 },
      { agentId: b, skillId: skills[2]!.id, order: 0 },
    ]);

    // Agent A: 2 done runs (cost 0.01 / 0.03) + 1 failed run (must be ignored for
    // runs and cost). Findings: 1 accepted + 2 dismissed + 1 undecided → 1/3 = 33.3%.
    await addRun(db, {
      workspaceId,
      agentId: a,
      prId: pr.id,
      status: 'done',
      costUsd: 0.01,
      decisions: ['accepted', 'dismissed'],
    });
    await addRun(db, {
      workspaceId,
      agentId: a,
      prId: pr.id,
      status: 'done',
      costUsd: 0.03,
      decisions: ['dismissed', 'open'],
    });
    await addRun(db, {
      workspaceId,
      agentId: a,
      prId: pr.id,
      status: 'failed',
      costUsd: 5,
    });

    // Agent B: 1 done run with a null cost, no decided findings.
    await addRun(db, {
      workspaceId,
      agentId: b,
      prId: pr.id,
      status: 'done',
      costUsd: null,
      decisions: ['open'],
    });

    const itemA = await listItem(app, a);
    expect(itemA).toMatchObject({ skill_count: 2, runs: 2, accept_rate: 33.3 });
    expect(itemA.avg_cost_usd as number).toBeCloseTo(0.02, 10);

    const itemB = await listItem(app, b);
    expect(itemB).toMatchObject({
      skill_count: 1,
      runs: 1,
      accept_rate: null, // findings exist but none decided → nothing to divide by
      avg_cost_usd: null, // the only done run has no price
    });
    await app.close();
  });

  it('statsForAgents is workspace-scoped and empty input costs no query', async () => {
    const repo = new AgentsRepository(pg.handle.db);
    expect((await repo.statsForAgents(workspaceId, [])).size).toBe(0);

    const app = await makeApp();
    const id = await createAgent(app, 'Stats Scoped');
    const otherWorkspace = '00000000-0000-0000-0000-000000000000';
    const stats = await repo.statsForAgents(otherWorkspace, [id]);
    // Entry exists (zeroed) but no run/finding rows of another workspace leak in.
    expect(stats.get(id)).toMatchObject({ runs: 0, accepted: 0, decided: 0, avgCostUsd: null });
    await app.close();
  });
});
