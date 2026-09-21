import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import { SkillsService } from '../src/modules/skills/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const GHOST = '00000000-0000-0000-0000-000000000000';

d('skills module (integration)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
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

  const createBody = {
    name: 'Test Skill',
    type: 'convention' as const,
    body: '# Rule\nBe kind.',
  };

  it('POST /skills creates v1 with defaults and a v1 snapshot', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({
      name: 'Test Skill',
      description: '',
      type: 'convention',
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ skill_id: skill.id, version: 1, body: createBody.body });
    expect(typeof versions[0].created_at).toBe('string');
    await app.close();
  });

  it('only a body change bumps the version and appends a snapshot', async () => {
    const app = await makeApp();
    const { id } = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();

    // name / description / type / enabled — no bump.
    const meta = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { name: 'Renamed', description: 'd', type: 'custom', enabled: false },
    });
    expect(meta.statusCode).toBe(200);
    expect(meta.json()).toMatchObject({ name: 'Renamed', type: 'custom', enabled: false, version: 1 });

    // Re-sending the identical body — still no bump.
    const same = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: createBody.body },
    });
    expect(same.json().version).toBe(1);

    // A real body change — v2.
    const changed = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: 'new body' },
    });
    expect(changed.json()).toMatchObject({ version: 2, body: 'new body' });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const v1 = (await app.inject({ method: 'GET', url: `/skills/${id}/versions/1` })).json();
    expect(v1.body).toBe(createBody.body);
    await app.close();
  });

  it('GET /skills lists with used_by = 0 and null rates for a fresh skill', async () => {
    const app = await makeApp();
    const { id } = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const row = list.find((s: { id: string }) => s.id === id);
    expect(row).toMatchObject({ used_by: 0, pull_rate: null, accept_rate: null });

    const stats = (await app.inject({ method: 'GET', url: `/skills/${id}/stats` })).json();
    expect(stats).toEqual({
      used_by: 0,
      pull_rate: null,
      accept_rate: null,
      findings_30d: 0,
      agents_using: [],
      findings_by_category: [],
    });
    await app.close();
  });

  it('404s for unknown skill / version, 422 for a non-numeric version, DELETE removes', async () => {
    const app = await makeApp();
    const { id } = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();

    for (const url of [
      `/skills/${GHOST}`,
      `/skills/${GHOST}/versions`,
      `/skills/${GHOST}/versions/1`,
      `/skills/${GHOST}/stats`,
      `/skills/${id}/versions/99`,
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${GHOST}`, payload: { name: 'x' } }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}/versions/abc` })).statusCode).toBe(
      422,
    );

    const del = await app.inject({ method: 'DELETE', url: `/skills/${id}` });
    expect(del.json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('rejects an empty body / unsupported source at the edge', async () => {
    const app = await makeApp();
    expect(
      (await app.inject({ method: 'POST', url: '/skills', payload: { ...createBody, body: '' } }))
        .statusCode,
    ).toBe(422);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/skills',
          payload: { ...createBody, source: 'community' },
        })
      ).statusCode,
    ).toBe(422);
    await app.close();
  });

  it('is workspace-scoped: another tenant cannot see, edit or delete a skill', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'skills-other' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign',
      type: 'custom',
      body: 'x',
    });

    // Via HTTP the request context is the default workspace → 404.
    const app = await makeApp();
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign.id}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${foreign.id}/versions` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${foreign.id}/stats` })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${foreign.id}` })).statusCode).toBe(
      404,
    );
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === foreign.id)).toBe(false);
    await app.close();

    // The owner can still read it.
    const service = new SkillsService({ repo });
    expect(await service.listVersions(otherWs!.id, foreign.id)).toHaveLength(1);
  });

  it('computes usage stats from real run history', async () => {
    const { db } = pg.handle;
    const [ws] = await db.insert(t.workspaces).values({ name: 'skills-stats' }).returning();
    const wsId = ws!.id;
    const skills = new SkillsRepository(db);
    const agents = new AgentsRepository(db);

    const skill = await skills.insert({ workspaceId: wsId, name: 'S', type: 'rubric', body: 'b' });
    const idle = await skills.insert({ workspaceId: wsId, name: 'Idle', type: 'rubric', body: 'b' });
    const mk = (name: string) =>
      agents.insert({
        workspaceId: wsId,
        name,
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'x',
      });
    const a1 = await mk('Alpha');
    const a2 = await mk('Beta'); // does NOT link the skill
    const a3 = await mk('Aardvark');
    await agents.linkSkill(a1.id, skill.id, 0);
    await agents.linkSkill(a3.id, skill.id, 0);

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'o', name: 'n', fullName: 'o/n' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId,
        repoId: repo!.id,
        number: 1,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
      })
      .returning();

    async function run(agentId: string, status: string, cost: number | null, pulled: boolean) {
      const [r] = await db
        .insert(t.agentRuns)
        .values({ workspaceId: wsId, agentId, prId: pr!.id, status, costUsd: cost })
        .returning();
      if (pulled) await db.insert(t.agentRunSkills).values({ agentRunId: r!.id, skillId: skill.id });
      return r!;
    }
    async function review(runId: string, agentId: string, createdAt?: Date) {
      const [rv] = await db
        .insert(t.reviews)
        .values({
          workspaceId: wsId,
          prId: pr!.id,
          agentId,
          runId,
          kind: 'review',
          ...(createdAt ? { createdAt } : {}),
        })
        .returning();
      return rv!.id;
    }
    async function finding(
      reviewId: string,
      category: string,
      state: 'accepted' | 'dismissed' | 'open',
    ) {
      await db.insert(t.findings).values({
        reviewId,
        file: 'f.ts',
        startLine: 1,
        endLine: 2,
        severity: 'minor',
        category,
        title: 't',
        rationale: 'r',
        confidence: 0.9,
        ...(state === 'accepted' ? { acceptedAt: new Date() } : {}),
        ...(state === 'dismissed' ? { dismissedAt: new Date() } : {}),
      });
    }

    // R1: A1, done, $0.10, skill pulled → bug(accepted) bug(dismissed) style(open)
    const r1 = await run(a1.id, 'done', 0.1, true);
    const rv1 = await review(r1.id, a1.id);
    await finding(rv1, 'bug', 'accepted');
    await finding(rv1, 'bug', 'dismissed');
    await finding(rv1, 'style', 'open');
    // R2: A1, done, $0.20, skill NOT pulled (was disabled at the time)
    await run(a1.id, 'done', 0.2, false);
    // R3: A2 (doesn't link the skill) — must not count anywhere.
    await run(a2.id, 'done', 9, false);
    // R4: A1, failed — not eligible.
    await run(a1.id, 'failed', null, false);

    const first = await skills.statsForSkills([skill.id, idle.id]);
    expect(first.get(skill.id)).toMatchObject({
      usedBy: 2,
      agentsUsing: [
        { id: a3.id, name: 'Aardvark' },
        { id: a1.id, name: 'Alpha' },
      ],
      eligibleRuns: 2,
      pulledRuns: 1,
      accepted: 1,
      decided: 2,
      findings30d: 3,
    });
    expect(first.get(skill.id)!.findingsByCategory).toEqual([
      { category: 'bug', cost_usd: 0.1 },
      { category: 'style', cost_usd: 0.1 }, // run cost counted once per category, not per finding
    ]);
    expect(first.get(idle.id)).toMatchObject({ usedBy: 0, eligibleRuns: 0, findings30d: 0 });

    // R5: A3, done, $0.40, pulled; its review is 60 days old → outside the 30d window.
    const r5 = await run(a3.id, 'done', 0.4, true);
    const old = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    await finding(await review(r5.id, a3.id, old), 'security', 'accepted');

    // Through the service/DTO layer the rates are percentages.
    const service = new SkillsService({ repo: skills });
    const stats = (await service.stats(wsId, skill.id))!;
    expect(stats.used_by).toBe(2);
    expect(stats.pull_rate).toBe(66.7); // 2 pulled / 3 eligible (R1, R2, R5)
    expect(stats.accept_rate).toBe(66.7); // 2 accepted / 3 decided
    expect(stats.findings_30d).toBe(3); // R5's finding is 60 days old
    expect(stats.findings_by_category).toEqual([
      { category: 'security', cost_usd: 0.4 },
      { category: 'bug', cost_usd: 0.1 },
      { category: 'style', cost_usd: 0.1 },
    ]);

    const list = await service.list(wsId);
    expect(list.map((s) => s.name)).toEqual(['S', 'Idle']); // createdAt asc
    expect(list[0]).toMatchObject({ used_by: 2, pull_rate: 66.7, accept_rate: 66.7 });
    expect(list[1]).toMatchObject({ used_by: 0, pull_rate: null, accept_rate: null });

    // Deleting the skill cascades its run links.
    expect(await skills.deleteById(wsId, skill.id)).toBe(true);
    const links = await db.select().from(t.agentRunSkills);
    expect(links.filter((l) => l.skillId === skill.id)).toHaveLength(0);
  });
});
