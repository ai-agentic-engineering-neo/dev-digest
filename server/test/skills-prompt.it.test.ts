import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Same fixture shape as reviews.it.test.ts — a diff touching src/config.ts. */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** One grounded finding on line 11 — deterministic, single-pass. */
const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Looks fine.',
  score: 90,
  findings: [
    {
      id: 'f-1',
      severity: 'WARNING',
      category: 'style',
      title: 'Minor nit',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'Style nit.',
      confidence: 0.8,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `skills-prompt-${repoSeq++}`;
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
      title: 'Add a config value',
      author: 'marisa.koch',
      branch: 'feat/x',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

let skillSeq = 0;
async function makeSkill(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { name: string; body: string; enabled?: boolean },
) {
  const [skill] = await db
    .insert(t.skills)
    .values({
      workspaceId,
      name: `${opts.name}-${skillSeq++}`,
      description: 'A test skill',
      type: 'convention',
      source: 'manual',
      body: opts.body,
      enabled: opts.enabled ?? true,
    })
    .returning();
  return skill!;
}

/**
 * specs/02-skills.md §7.5 + §11's `skills-prompt.it.test.ts` row: a linked,
 * enabled skill must show up in the run's prompt trace AND in `agent_run_skills`
 * — and an agent with no enabled skills must produce a prompt byte-identical
 * to the pre-feature shape (acceptance criterion 5's control experiment).
 */
d('skills prompt assembly + agent_run_skills (specs/02-skills.md §7.5)', () => {
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

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  it('attaches exactly the truly-enabled skills, in link order, to the prompt trace and agent_run_skills', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // order 0: link enabled, skill enabled       -> truly enabled
    // order 1: link DISABLED, skill enabled       -> excluded
    // order 2: link enabled, skill itself DISABLED -> excluded
    // order 3: link enabled, skill enabled        -> truly enabled
    const skillA = await makeSkill(pg.handle.db, workspaceId, { name: 'skill-a', body: 'Body A.' });
    const skillB = await makeSkill(pg.handle.db, workspaceId, { name: 'skill-b', body: 'Body B.' });
    const skillC = await makeSkill(pg.handle.db, workspaceId, {
      name: 'skill-c',
      body: 'Body C.',
      enabled: false,
    });
    const skillD = await makeSkill(pg.handle.db, workspaceId, { name: 'skill-d', body: 'Body D.' });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skills Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
      })
    ).json();

    await pg.handle.db.insert(t.agentSkills).values([
      { agentId: agent.id, skillId: skillA.id, order: 0, enabled: true },
      { agentId: agent.id, skillId: skillB.id, order: 1, enabled: false },
      { agentId: agent.id, skillId: skillC.id, order: 2, enabled: true },
      { agentId: agent.id, skillId: skillD.id, order: 3, enabled: true },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id;

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    const expectedSkillsBlock = [
      `### ${skillA.name}\n${skillA.body}`,
      `### ${skillD.name}\n${skillD.body}`,
    ].join('\n\n');
    expect(trace.prompt_assembly.skills).toBe(expectedSkillsBlock);
    // the log names the count + a real (tokenizer-derived) token delta
    expect(trace.log.some((l: { msg: string }) => /^skills: 2 attached \(\+~\d+ tokens\)$/.test(l.msg))).toBe(
      true,
    );

    const rows = await pg.handle.db
      .select()
      .from(t.agentRunSkills)
      .where(eq(t.agentRunSkills.runId, runId))
      .orderBy(asc(t.agentRunSkills.order));
    expect(rows.map((r) => r.skillId)).toEqual([skillA.id, skillD.id]);
    expect(rows.map((r) => r.order)).toEqual([0, 1]);

    await app.close();
  });

  it('an agent with zero enabled skills gets assembly.skills === null (not [] or ""), and no agent_run_skills rows', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Linked but disabled at the link — enabledSkillsForPrompt must exclude it,
    // so this run must look exactly like a skill-less agent's run.
    const skillOff = await makeSkill(pg.handle.db, workspaceId, {
      name: 'skill-off',
      body: 'Never sent.',
    });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'No Skills Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
      })
    ).json();

    await pg.handle.db
      .insert(t.agentSkills)
      .values({ agentId: agent.id, skillId: skillOff.id, order: 0, enabled: false });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id;

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.skills).toBeNull();
    // control experiment: no skills log line at all when there's nothing to attach
    expect(trace.log.some((l: { msg: string }) => l.msg.startsWith('skills:'))).toBe(false);

    const rows = await pg.handle.db
      .select()
      .from(t.agentRunSkills)
      .where(eq(t.agentRunSkills.runId, runId));
    expect(rows).toHaveLength(0);

    await app.close();
  });
});
