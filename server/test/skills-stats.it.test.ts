import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills-stats] Docker not available — skipping integration tests.');
}

/**
 * GET /skills/:id/stats (specs/02-skills.md §7.2) — every tile is run-level,
 * aggregated over agent_run_skills ⋈ agent_runs ⋈ reviews ⋈ findings, windowed
 * on agent_runs.ran_at. Covers: the pull-frequency denominator, accept rate
 * over settled findings only, null when nothing is settled, the category
 * rollup, and the window bound.
 */
d('GET /skills/:id/stats', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;

    const suffix = Math.random().toString(36).slice(2, 10);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `stats-${suffix}`, fullName: `acme/stats-${suffix}` })
      .returning();
    repoId = repo!.id;
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

  let prCounter = 1000;

  async function makePr() {
    const number = prCounter++;
    const [row] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number,
        title: `PR ${number}`,
        author: 'tester',
        branch: `feature-${number}`,
        base: 'main',
        headSha: `sha-${number}`,
      })
      .returning();
    return row!;
  }

  async function makeAgent(name: string) {
    const [row] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name, provider: 'openai', model: 'gpt-4o-mini', systemPrompt: 'Review.' })
      .returning();
    return row!;
  }

  async function makeSkill(name: string) {
    const [row] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name, description: 'desc', type: 'convention', source: 'manual', body: 'Body' })
      .returning();
    return row!;
  }

  async function linkAgentSkill(agentId: string, skillId: string) {
    await pg.handle.db.insert(t.agentSkills).values({ agentId, skillId, order: 0 });
  }

  async function makeRun(agentId: string, prId: string, ranAt: Date) {
    const [row] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, agentId, prId, ranAt, status: 'done' })
      .returning();
    return row!;
  }

  async function linkRunSkill(runId: string, skillId: string) {
    await pg.handle.db.insert(t.agentRunSkills).values({ runId, skillId, order: 0 });
  }

  async function makeReview(prId: string, agentId: string, runId: string) {
    const [row] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, runId, kind: 'review' })
      .returning();
    return row!;
  }

  async function makeFinding(
    reviewId: string,
    opts: { category?: string; acceptedAt?: Date | null; dismissedAt?: Date | null } = {},
  ) {
    const [row] = await pg.handle.db
      .insert(t.findings)
      .values({
        reviewId,
        file: 'src/index.ts',
        startLine: 1,
        endLine: 2,
        severity: 'warning',
        category: opts.category ?? 'style',
        title: 'Finding',
        rationale: 'Because.',
        confidence: 0.9,
        acceptedAt: opts.acceptedAt ?? null,
        dismissedAt: opts.dismissedAt ?? null,
      })
      .returning();
    return row!;
  }

  async function getStats(app: Awaited<ReturnType<typeof makeApp>>, skillId: string, days?: number) {
    const url = days !== undefined ? `/skills/${skillId}/stats?days=${days}` : `/skills/${skillId}/stats`;
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  it('pull_frequency = runs_with_skill / runs_by_linked_agents, within the default window', async () => {
    const app = await makeApp();
    const skill = await makeSkill(`pf-${Date.now()}`);
    const agent = await makeAgent(`PF Agent ${Date.now()}`);
    await linkAgentSkill(agent.id, skill.id);

    const now = new Date();
    const [pr1, pr2, pr3] = [await makePr(), await makePr(), await makePr()];
    const run1 = await makeRun(agent.id, pr1.id, now);
    const run2 = await makeRun(agent.id, pr2.id, now);
    const run3 = await makeRun(agent.id, pr3.id, now); // no skill attached

    await linkRunSkill(run1.id, skill.id);
    await linkRunSkill(run2.id, skill.id);
    void run3;

    const stats = await getStats(app, skill.id);
    expect(stats.used_by).toBe(1);
    expect(stats.agents).toEqual([{ id: agent.id, name: agent.name }]);
    expect(stats.runs_with_skill).toBe(2);
    expect(stats.runs_by_linked_agents).toBe(3);
    expect(stats.pull_frequency).toBeCloseTo(2 / 3);

    await app.close();
  });

  it('renders `null` (never a synthetic 0) when a skill is linked to nothing', async () => {
    const app = await makeApp();
    const skill = await makeSkill(`unused-${Date.now()}`);

    const stats = await getStats(app, skill.id);
    expect(stats.used_by).toBe(0);
    expect(stats.agents).toEqual([]);
    expect(stats.runs_by_linked_agents).toBe(0);
    expect(stats.pull_frequency).toBeNull();
    expect(stats.settled).toBe(0);
    expect(stats.accept_rate).toBeNull();

    await app.close();
  });

  it('accept_rate is computed over settled findings only, and by_category rolls up that same set', async () => {
    const app = await makeApp();
    const skill = await makeSkill(`accept-${Date.now()}`);
    const agent = await makeAgent(`Accept Agent ${Date.now()}`);
    await linkAgentSkill(agent.id, skill.id);

    const pr = await makePr();
    const run = await makeRun(agent.id, pr.id, new Date());
    await linkRunSkill(run.id, skill.id);
    const review = await makeReview(pr.id, agent.id, run.id);

    await makeFinding(review.id, { category: 'security', acceptedAt: new Date() }); // accepted
    await makeFinding(review.id, { category: 'security', dismissedAt: new Date() }); // dismissed
    await makeFinding(review.id, { category: 'style' }); // untouched — not settled

    const stats = await getStats(app, skill.id);
    expect(stats.findings).toBe(3);
    expect(stats.accepted).toBe(1);
    expect(stats.settled).toBe(2); // accepted + dismissed, NOT the untouched one
    expect(stats.accept_rate).toBeCloseTo(0.5);
    expect(stats.by_category.sort((a: { category: string }, b: { category: string }) =>
      a.category.localeCompare(b.category),
    )).toEqual([
      { category: 'security', count: 2 },
      { category: 'style', count: 1 },
    ]);

    await app.close();
  });

  it('accept_rate is `null` when nothing is settled', async () => {
    const app = await makeApp();
    const skill = await makeSkill(`unsettled-${Date.now()}`);
    const agent = await makeAgent(`Unsettled Agent ${Date.now()}`);
    await linkAgentSkill(agent.id, skill.id);

    const pr = await makePr();
    const run = await makeRun(agent.id, pr.id, new Date());
    await linkRunSkill(run.id, skill.id);
    const review = await makeReview(pr.id, agent.id, run.id);
    await makeFinding(review.id, {});
    await makeFinding(review.id, {});

    const stats = await getStats(app, skill.id);
    expect(stats.findings).toBe(2);
    expect(stats.accepted).toBe(0);
    expect(stats.settled).toBe(0);
    expect(stats.accept_rate).toBeNull();

    await app.close();
  });

  it('honors the window bound: a run outside `?days=` is excluded, and included with a wider window', async () => {
    const app = await makeApp();
    const skill = await makeSkill(`window-${Date.now()}`);
    const agent = await makeAgent(`Window Agent ${Date.now()}`);
    await linkAgentSkill(agent.id, skill.id);

    const longAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
    const pr = await makePr();
    const run = await makeRun(agent.id, pr.id, longAgo);
    await linkRunSkill(run.id, skill.id);
    const review = await makeReview(pr.id, agent.id, run.id);
    await makeFinding(review.id, { acceptedAt: new Date() });

    const within30 = await getStats(app, skill.id, 30);
    expect(within30.runs_with_skill).toBe(0);
    expect(within30.runs_by_linked_agents).toBe(0);
    expect(within30.findings).toBe(0);

    const within200 = await getStats(app, skill.id, 200);
    expect(within200.runs_with_skill).toBe(1);
    expect(within200.runs_by_linked_agents).toBe(1);
    expect(within200.findings).toBe(1);
    expect(within200.window_days).toBe(200);

    await app.close();
  });
});
