import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-run-estimates] Docker not available — skipping integration tests.');
}

d('GET /agents/run-estimates', () => {
  let pg: PgFixture;
  let wsId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    wsId = ws!.id;
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

  async function newAgent(workspaceId: string, name: string) {
    return new AgentsRepository(pg.handle.db).insert({
      workspaceId,
      name,
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'x',
    });
  }

  async function addRun(
    workspaceId: string,
    agentId: string,
    o: { status: string; durationMs: number | null; costUsd: number | null; minutesAgo: number },
  ) {
    await pg.handle.db.insert(t.agentRuns).values({
      workspaceId,
      agentId,
      status: o.status,
      durationMs: o.durationMs,
      costUsd: o.costUsd,
      ranAt: new Date(Date.now() - o.minutesAgo * 60_000),
    });
  }

  it('averages the 5 newest done runs, ignores other statuses, omits empty agents', async () => {
    const agent = await newAgent(wsId, 'Estimated');
    // 7 done runs: minutesAgo 1..7; durations 100..700 (newest = 100). Newest 5 → 100..500.
    for (let i = 1; i <= 7; i++) {
      await addRun(wsId, agent.id, {
        status: 'done',
        durationMs: i * 100,
        costUsd: i,
        minutesAgo: i,
      });
    }
    await addRun(wsId, agent.id, { status: 'failed', durationMs: 99999, costUsd: 99, minutesAgo: 0 });
    await addRun(wsId, agent.id, { status: 'running', durationMs: 99999, costUsd: 99, minutesAgo: 0 });
    await addRun(wsId, agent.id, { status: 'cancelled', durationMs: 99999, costUsd: 99, minutesAgo: 0 });

    const onlyFailed = await newAgent(wsId, 'OnlyFailed');
    await addRun(wsId, onlyFailed.id, { status: 'failed', durationMs: 10, costUsd: 1, minutesAgo: 1 });

    const noCost = await newAgent(wsId, 'NoCost');
    await addRun(wsId, noCost.id, { status: 'done', durationMs: 50, costUsd: null, minutesAgo: 1 });

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/agents/run-estimates' });
    expect(res.statusCode).toBe(200);
    const { estimates } = res.json() as {
      estimates: { agent_id: string; sample_size: number; avg_duration_ms: number; avg_cost_usd: number | null }[];
    };
    const byId = new Map(estimates.map((e) => [e.agent_id, e]));
    expect(byId.get(agent.id)).toMatchObject({
      sample_size: 5,
      avg_duration_ms: 300,
      avg_cost_usd: 3,
    });
    expect(byId.has(onlyFailed.id)).toBe(false);
    expect(byId.get(noCost.id)).toMatchObject({ sample_size: 1, avg_cost_usd: null });
    await app.close();
  });

  it('never includes another workspace agents or runs', async () => {
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-est' }).returning();
    const foreign = await newAgent(otherWs!.id, 'Foreign');
    await addRun(otherWs!.id, foreign.id, { status: 'done', durationMs: 10, costUsd: 1, minutesAgo: 1 });

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/agents/run-estimates' });
    const ids = (res.json() as { estimates: { agent_id: string }[] }).estimates.map((e) => e.agent_id);
    expect(ids).not.toContain(foreign.id);
    await app.close();
  });

  it('GET /agents/:id still resolves a uuid', async () => {
    const [seeded] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.workspaceId, wsId)).limit(1);
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/agents/${seeded!.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(seeded!.id);
    await app.close();
  });
});
