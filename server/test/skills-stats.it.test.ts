import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-stats] Docker not available — skipping integration tests.');
}

/**
 * L02 — the Stats tab's measured facts.
 *
 * Run/review/finding history is inserted directly (not driven through a real
 * review, which would need a live LLM) so each scenario is a controlled
 * fixture: exactly N runs, exactly one of which injected the skill, exactly
 * these findings in exactly these judged states.
 *
 * The two rules under test throughout: `null` means UNMEASURED and must never
 * collapse into a measured `0`; findings attribution is RUN-level (a run's
 * findings count toward every skill it injected), which is why `findings_30d`
 * and `by_category` are read off `run_skills`, not off `agent_skills`.
 */
d('skills stats (Testcontainers pg)', () => {
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

  let repoSeq = 0;
  async function setupRepoAndPr() {
    const name = `stats-repo-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Stats fixture PR',
        author: 'octocat',
        branch: 'feat/x',
        base: 'main',
        headSha: 'deadbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    return pr!;
  }

  it('a skill with no runs reports unmeasured (null), not zero', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'never-run-skill', description: '', type: 'custom', body: '# T\nBody.' },
      })
    ).json();

    const stats = await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` });
    expect(stats.statusCode).toBe(200);
    expect(stats.json()).toEqual({
      used_by: 0,
      agents: [],
      pull_pct: null,
      accept_pct: null,
      findings_30d: 0,
      by_category: [],
      avg_tokens: null,
    });

    await app.close();
  });

  it('pull_pct, findings, accept_pct and category counts from a controlled run history', async () => {
    const app = await makeApp();

    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: {
          name: 'measured-skill',
          description: '',
          type: 'security',
          body: '# T\nBody.',
        },
      })
    ).json();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Stats Fixture Agent',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review.',
        },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: skill.id },
    });

    const pr = await setupRepoAndPr();

    // Two DONE runs by the linked agent; only run1 actually injected the skill.
    const [run1] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, agentId: agent.id, prId: pr.id, status: 'done' })
      .returning();
    const [run2] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, agentId: agent.id, prId: pr.id, status: 'done' })
      .returning();

    await pg.handle.db
      .insert(t.runSkills)
      .values({ runId: run1!.id, skillId: skill.id, order: 0, tokens: 42 });

    // run1's review carries three findings: one accepted, one dismissed, one
    // never judged. The unjudged one must be excluded from BOTH sides of
    // accept_pct, while still counting toward findings_30d and by_category.
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        agentId: agent.id,
        runId: run1!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'fixture',
        score: 50,
        model: 'gpt-4o-mini',
      })
      .returning();

    const now = new Date();
    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Accepted finding',
        rationale: 'r',
        confidence: 0.9,
        acceptedAt: now,
      },
      {
        reviewId: review!.id,
        file: 'b.ts',
        startLine: 2,
        endLine: 2,
        severity: 'WARNING',
        category: 'security',
        title: 'Dismissed finding',
        rationale: 'r',
        confidence: 0.8,
        dismissedAt: now,
      },
      {
        reviewId: review!.id,
        file: 'c.ts',
        startLine: 3,
        endLine: 3,
        severity: 'SUGGESTION',
        category: 'bug',
        title: 'Unjudged finding',
        rationale: 'r',
        confidence: 0.5,
      },
    ]);

    const stats = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })
    ).json();

    expect(stats.used_by).toBe(1);
    expect(stats.agents).toEqual([{ id: agent.id, name: 'Stats Fixture Agent' }]);
    // 1 of 2 done runs by the linked agent actually injected the skill.
    expect(stats.pull_pct).toBe(50);
    // Unjudged finding excluded from both sides: accepted=1, dismissed=1 → 50%.
    expect(stats.accept_pct).toBe(50);
    expect(stats.findings_30d).toBe(3);
    expect(stats.by_category).toEqual(
      expect.arrayContaining([
        { category: 'security', count: 2 },
        { category: 'bug', count: 1 },
      ]),
    );
    expect(stats.avg_tokens).toBe(42);

    // The rail's batched list stats agree with the single-skill endpoint.
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const row = list.find((s: { id: string }) => s.id === skill.id);
    expect(row.stats).toEqual({ used_by: 1, pull_pct: 50, accept_pct: 50 });

    await app.close();
  });

  it('a workspace-disabled skill is excluded from USED BY even while still linked', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'gate-check-skill', description: '', type: 'custom', body: '# T\nB.' },
      })
    ).json();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Gate Check Agent',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review.',
        },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: skill.id },
    });

    const before = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
    expect(before.used_by).toBe(1);

    // Toggle the PER-AGENT gate off (not the workspace one) — the link stays,
    // `enabled` flips. USED BY counts only agents whose link is currently on.
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills/${skill.id}`,
      payload: { enabled: false },
    });

    const linkRow = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, skill.id));
    expect(linkRow).toHaveLength(1); // still linked, just disabled

    const after = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
    expect(after.used_by).toBe(0);
    expect(after.agents).toEqual([]);

    await app.close();
  });
});
