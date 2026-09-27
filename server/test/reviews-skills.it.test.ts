import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[reviews-skills] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/rate-limit.ts b/src/rate-limit.ts
--- a/src/rate-limit.ts
+++ b/src/rate-limit.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  window: 60,
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Reviewed.',
  score: 90,
  findings: [
    {
      id: 'f1',
      severity: 'WARNING',
      category: 'test',
      title: 'Only the happy path is covered',
      file: 'src/rate-limit.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'The over-limit branch has no assertion.',
      confidence: 0.8,
      kind: 'finding',
    },
  ],
};

/**
 * The claim the whole feature rests on, measured instead of asserted in a demo:
 * a linked ENABLED skill puts a labelled block into the prompt, and an unlinked
 * or disabled one changes nothing. This is the deterministic half of
 * `specs/skills-control-experiment.md` — no model judgement involved, just the
 * bytes that were sent.
 */
d('skills in the review prompt', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prSeq = 0;
  /** Unique suffix per fixture — `prSeq` moves during a test, so it cannot be one. */
  let nameSeq = 0;
  const uniq = (prefix: string) => `${prefix}-${nameSeq++}`;

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
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  /** A fresh repo + PR per run so `agent_runs` never mixes two scenarios. */
  async function setupPr() {
    const db = pg.handle.db;
    const name = `skills-api-${prSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'deadbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/rate-limit.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  window: 60,\n   redisUrl: x,',
    });
    return pr!;
  }

  type App = Awaited<ReturnType<typeof makeApp>>;

  async function makeAgent(app: App, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review the diff.' },
      })
    ).json();
  }

  async function makeSkill(app: App, name: string, body: string, enabled = true) {
    const skill = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, description: `${name} description`, type: 'custom', body },
      })
    ).json();
    if (!enabled) {
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } });
    }
    return skill;
  }

  /** Run the agent on a fresh PR and return the persisted trace. */
  async function runAndTrace(app: App, agentId: string) {
    const pr = await setupPr();
    const body = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { agentId },
      })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const runId = body.runs[0].run_id;
    return (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
  }

  it('without linked skills the prompt carries no skills block at all', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, uniq('Bare'));

    const trace = await runAndTrace(app, agent.id);
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Skills / rules');
    expect(trace.log.some((l: { msg: string }) => /no enabled skills/i.test(l.msg))).toBe(true);
    await app.close();
  });

  it('linked enabled skills become labelled blocks, in the order the agent sets', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, uniq('Linked'));
    const first = await makeSkill(app, uniq('first-skill'), '# First\n\nAlpha rule.');
    const second = await makeSkill(app, uniq('second-skill'), '# Second\n\nBeta rule.');

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [second.id, first.id] },
    });

    const trace = await runAndTrace(app, agent.id);
    const skills: string = trace.prompt_assembly.skills;
    expect(skills).toContain('Alpha rule.');
    expect(skills).toContain('Beta rule.');
    // Order is the LINK order, not creation order.
    expect(skills.indexOf('Beta rule.')).toBeLessThan(skills.indexOf('Alpha rule.'));
    expect(skills).toContain(`### Skill: ${second.name} (custom · manual)`);
    expect(trace.prompt_assembly.user).toContain('## Skills / rules');
    await app.close();
  });

  it('a disabled skill is linked but never reaches the prompt', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, uniq('Disabled'));
    const on = await makeSkill(app, uniq('on-skill'), '# On\n\nVisible rule.');
    const off = await makeSkill(app, uniq('off-skill'), '# Off\n\nHidden rule.', false);

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [on.id, off.id] },
    });
    // Both links exist …
    expect(
      (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json(),
    ).toHaveLength(2);

    // … but only the enabled one is in the prompt.
    const trace = await runAndTrace(app, agent.id);
    expect(trace.prompt_assembly.skills).toContain('Visible rule.');
    expect(trace.prompt_assembly.skills).not.toContain('Hidden rule.');
    await app.close();
  });

  it('an imported skill is labelled as third-party text in the prompt block', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, uniq('Imported'));
    const imported = (
      await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: {
          name: uniq('borrowed'),
          description: 'Somebody else’s rule.',
          type: 'custom',
          source: 'community',
          body: '# Borrowed\n\nForeign rule.',
        },
      })
    ).json();
    // It arrives disabled, so it must be enabled before it can affect a review.
    expect(imported.enabled).toBe(false);
    await app.inject({
      method: 'PUT',
      url: `/skills/${imported.id}`,
      payload: { enabled: true },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [imported.id] },
    });

    const trace = await runAndTrace(app, agent.id);
    expect(trace.prompt_assembly.skills).toContain('third-party text');
    expect(trace.prompt_assembly.skills).toContain('Foreign rule.');
    await app.close();
  });
});
