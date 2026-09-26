/**
 * Skills module — CRUD, version history (S4/S5), tenancy (S7), import preview
 * (S6, writes nothing), and S10 stats — against a real Postgres.
 *
 * Stats are tested by INSERTING `agent_runs` + `run_traces` rows directly (the
 * "insert runs, don't run them" pattern from `pulls-cost.it.test.ts` /
 * server/INSIGHTS.md) rather than driving an LLM.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('Skills module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({ config: config(), db: pg.handle.db });
  }

  const createBody = {
    name: 'Rate Limit Rubric',
    description: 'Checks rate limiting patterns on public endpoints',
    type: 'rubric' as const,
    body: 'Check for rate limiting on public endpoints.',
  };

  // ---- CRUD + versions (S4) ------------------------------------------------

  it('full CRUD: create, get, list, update, delete', async () => {
    const app = await makeApp();

    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: createBody.name,
      description: createBody.description,
      type: 'rubric',
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const got = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().id).toBe(skill.id);

    const listed = await app.inject({ method: 'GET', url: '/skills' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().some((s: { id: string }) => s.id === skill.id)).toBe(true);

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { description: 'Updated description' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().description).toBe('Updated description');

    const deleted = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(deleted.statusCode).toBe(200);

    const afterDelete = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(afterDelete.statusCode).toBe(404);
    await app.close();
  });

  it('PUT changing body bumps the version and records a skill_versions row with the note', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: createBody }))
      .json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'New body text.', note: 'Tightened the rule' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({ version: 2, note: 'Tightened the rule', current: true });
    expect(versions[1]).toMatchObject({ version: 1, current: false });

    const v2 = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/2` });
    expect(v2.statusCode).toBe(200);
    expect(v2.json()).toMatchObject({ version: 2, body: 'New body text.' });
    await app.close();
  });

  it('PUT changing ONLY enabled does NOT bump the version or write a skill_versions row', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: createBody }))
      .json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { enabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ version: 1, enabled: false });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('S5 — restoring an old version is a normal save: bumps version and never rewrites history', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: createBody }))
      .json().id as string;
    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'Second body.' },
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    const restoredSkill = restored.json();
    expect(restoredSkill.version).toBe(3);
    expect(restoredSkill.body).toBe(createBody.body);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0]).toMatchObject({ note: 'Restored from v1' });
    // v1 and v2 are untouched — restoring appended, it did not rewrite them.
    const v1 = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/1` });
    expect(v1.json().body).toBe(createBody.body);
    const v2 = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/2` });
    expect(v2.json().body).toBe('Second body.');
    await app.close();
  });

  // ---- tenancy (S7) ---------------------------------------------------------

  it('a skill from another workspace is invisible: GET/PUT return undefined -> 404', async () => {
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign Skill',
        description: 'Belongs to another workspace',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();

    const service = new SkillsService({ db: pg.handle.db } as unknown as Container);
    expect(await service.get(otherWs!.id, foreign!.id)).toBeDefined();
    expect(await service.get(workspaceId, foreign!.id)).toBeUndefined();
    expect(await service.update(workspaceId, foreign!.id, { enabled: false })).toBeUndefined();
  });

  // ---- import preview (S6) ---------------------------------------------------

  it('POST /skills/import/preview writes nothing to the DB', async () => {
    const app = await makeApp();
    const countBefore = (await pg.handle.db.select().from(t.skills)).length;

    const content = '---\nname: Preview Only\ndescription: Should not persist\ntype: custom\n---\nBody.';
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: {
        filename: 'preview.md',
        content_base64: Buffer.from(content, 'utf-8').toString('base64'),
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Preview Only', body: 'Body.' });

    const countAfter = (await pg.handle.db.select().from(t.skills)).length;
    expect(countAfter).toBe(countBefore);
    await app.close();
  });

  // ---- S10 stats --------------------------------------------------------

  describe('GET /skills/:id/stats', () => {
    async function insertRepoAndPr() {
      const [repo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: `skills-stats-${Date.now()}`, fullName: `acme/skills-stats-${Date.now()}` })
        .returning();
      const [pr] = await pg.handle.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: repo!.id,
          number: 900 + Math.floor(Math.random() * 1000),
          title: 'Skills stats fixture PR',
          author: 'tester',
          branch: 'feat/x',
          base: 'main',
          headSha: 'cafebabe',
          additions: 1,
          deletions: 0,
          filesCount: 1,
          status: 'open',
        })
        .returning();
      return { repo: repo!, pr: pr! };
    }

    it('computes pull_rate/accept_rate/findings_30d/by_category from inserted runs, and returns null on zero denominators', async () => {
      const app = await makeApp();

      // A skill with no linked agents at all — every rate is null, not 0.
      const bare = (
        await app.inject({ method: 'POST', url: '/skills', payload: createBody })
      ).json();
      const bareStats = (
        await app.inject({ method: 'GET', url: `/skills/${bare.id}/stats` })
      ).json();
      expect(bareStats).toMatchObject({
        used_by: 0,
        agents: [],
        pull_rate: null,
        accept_rate: null,
        findings_30d: null,
        by_category: [],
      });

      // A skill linked to one agent, with two runs: one whose trace USED the
      // skill (S9 skills_used containment) and one whose trace predates that
      // field entirely (nullish — must parse fine, must NOT count as used).
      const skill = (
        await app.inject({ method: 'POST', url: '/skills', payload: createBody })
      ).json();

      const [agent] = await pg.handle.db
        .insert(t.agents)
        .values({
          workspaceId,
          name: 'Stats Agent',
          provider: 'openai',
          model: 'gpt-4o-mini',
          systemPrompt: 'Review the diff.',
        })
        .returning();
      await pg.handle.db
        .insert(t.agentSkills)
        .values({ agentId: agent!.id, skillId: skill.id, order: 0, enabled: true });

      const { pr } = await insertRepoAndPr();

      const [usedRun] = await pg.handle.db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId: agent!.id,
          prId: pr.id,
          provider: 'openai',
          model: 'gpt-4o-mini',
          status: 'done',
          durationMs: 1000,
          tokensIn: 500,
          tokensOut: 50,
        })
        .returning();
      const [unusedRun] = await pg.handle.db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId: agent!.id,
          prId: pr.id,
          provider: 'openai',
          model: 'gpt-4o-mini',
          status: 'done',
          durationMs: 1000,
          tokensIn: 500,
          tokensOut: 50,
        })
        .returning();

      await pg.handle.db.insert(t.runTraces).values({
        runId: usedRun!.id,
        trace: {
          config: { agent: 'Stats Agent', model: 'gpt-4o-mini', source: 'local' },
          stats: {
            duration_ms: 1000,
            tokens_in: 500,
            tokens_out: 50,
            cost_usd: null,
            findings: 3,
            grounding: '3/3 passed',
          },
          prompt_assembly: {
            system: 'sys',
            skills_used: [{ id: skill.id, name: skill.name, version: 1, tokens: 42 }],
            user: 'diff',
          },
          tool_calls: [],
          raw_output: '{}',
          memory_pulled: [],
          specs_read: [],
          log: [],
        },
      });
      // Old-shape trace: no `skills_used` key at all.
      await pg.handle.db.insert(t.runTraces).values({
        runId: unusedRun!.id,
        trace: {
          config: { agent: 'Stats Agent', model: 'gpt-4o-mini', source: 'local' },
          stats: {
            duration_ms: 1000,
            tokens_in: 500,
            tokens_out: 50,
            cost_usd: null,
            findings: 1,
            grounding: '1/1 passed',
          },
          prompt_assembly: { system: 'sys', user: 'diff' },
          tool_calls: [],
          raw_output: '{}',
          memory_pulled: [],
          specs_read: [],
          log: [],
        },
      });

      // Findings on the USED run's review count; findings on the unused run's
      // review must NOT leak into accept_rate/findings_30d/by_category.
      const [usedReview] = await pg.handle.db
        .insert(t.reviews)
        .values({ workspaceId, prId: pr.id, agentId: agent!.id, runId: usedRun!.id, kind: 'review' })
        .returning();
      await pg.handle.db.insert(t.findings).values([
        {
          reviewId: usedReview!.id,
          file: 'a.ts',
          startLine: 1,
          endLine: 1,
          severity: 'CRITICAL',
          category: 'security',
          title: 'Accepted finding',
          rationale: 'x',
          confidence: 0.9,
          acceptedAt: new Date(),
        },
        {
          reviewId: usedReview!.id,
          file: 'a.ts',
          startLine: 2,
          endLine: 2,
          severity: 'WARNING',
          category: 'security',
          title: 'Dismissed finding',
          rationale: 'x',
          confidence: 0.8,
          dismissedAt: new Date(),
        },
        {
          reviewId: usedReview!.id,
          file: 'b.ts',
          startLine: 1,
          endLine: 1,
          severity: 'SUGGESTION',
          category: 'style',
          title: 'Pending finding',
          rationale: 'x',
          confidence: 0.5,
        },
      ]);

      const [unusedReview] = await pg.handle.db
        .insert(t.reviews)
        .values({ workspaceId, prId: pr.id, agentId: agent!.id, runId: unusedRun!.id, kind: 'review' })
        .returning();
      await pg.handle.db.insert(t.findings).values({
        reviewId: unusedReview!.id,
        file: 'c.ts',
        startLine: 1,
        endLine: 1,
        severity: 'CRITICAL',
        category: 'bug',
        title: 'Must not be counted',
        rationale: 'x',
        confidence: 0.9,
        acceptedAt: new Date(),
      });

      const stats = (
        await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })
      ).json();

      expect(stats.used_by).toBe(1);
      expect(stats.agents).toEqual([{ id: agent!.id, name: 'Stats Agent' }]);
      // 1 used run out of 2 total runs by agents linked to this skill.
      expect(stats.pull_rate).toBeCloseTo(0.5, 9);
      // 1 accepted of 2 considered (accepted+dismissed) from the USED run only.
      expect(stats.accept_rate).toBeCloseTo(0.5, 9);
      expect(stats.findings_30d).toBe(3);
      expect(stats.by_category).toEqual(
        expect.arrayContaining([
          { category: 'security', count: 2 },
          { category: 'style', count: 1 },
        ]),
      );
      await app.close();
    });
  });
});
