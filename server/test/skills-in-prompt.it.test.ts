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
  console.warn('[skills-in-prompt] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

/**
 * THE control-experiment wiring: an agent's linked skills have to end up in the
 * assembled prompt, in link order, and a skill switched off at either level has
 * to be absent — not merely present-and-ignored. If this breaks, a with-skills
 * run and a without-skills run become the same run, and every demo built on the
 * comparison silently stops meaning anything.
 */
d('linked skills reach the review prompt', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

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
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  async function setupPr() {
    const name = `skills-prompt-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 900 + repoSeq,
        title: 'Add a thing',
        author: 'dev',
        branch: 'feat/thing',
        base: 'main',
        headSha: 'deadbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'A change.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  type App = Awaited<ReturnType<typeof makeApp>>;

  async function makeAgent(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Prompt Agent ${Math.random().toString(36).slice(2, 8)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'Review the diff.',
        // Keep repo-intel out of it so the assembled prompt contains only the
        // sections this test is about.
        repo_intel: false,
      },
    });
    return res.json().id as string;
  }

  async function makeSkill(app: App, name: string, over: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name,
        description: `${name} description`,
        type: 'custom',
        body: `Rule body for ${name}`,
        ...over,
      },
    });
    return res.json();
  }

  /**
   * Run one review to completion and return its persisted trace.
   *
   * The run executor marks `agent_runs` terminal BEFORE it writes the trace
   * document, so waiting on run status alone can land in the gap and get a 404.
   * Poll for the trace itself rather than sleeping on a guess.
   */
  async function runAndTrace(app: App, prId: string, agentId: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { agentId },
    });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });

    const deadline = Date.now() + 5_000;
    for (;;) {
      const trace = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      if (trace.statusCode === 200) return trace.json();
      if (Date.now() > deadline) {
        throw new Error(`trace for run ${runId} never appeared (last ${trace.statusCode})`);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it('an agent with no skills produces the pre-skills prompt (no skills section)', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const trace = await runAndTrace(app, pr.id, await makeAgent(app));

    // Null, not an empty string: the section is omitted from the user message.
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Skills / rules');
    await app.close();
  });

  it('linked + enabled skills appear in the prompt, in link order', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const agentId = await makeAgent(app);
    const first = await makeSkill(app, 'zeta-rule');
    const second = await makeSkill(app, 'alpha-rule');

    // Deliberately NOT alphabetical: the prompt must follow the link order.
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [first.id, second.id] },
    });

    const trace = await runAndTrace(app, pr.id, agentId);
    const skills = trace.prompt_assembly.skills as string;

    expect(skills).toContain('### zeta-rule');
    expect(skills).toContain('Rule body for alpha-rule');
    expect(skills.indexOf('zeta-rule')).toBeLessThan(skills.indexOf('alpha-rule'));
    expect(trace.prompt_assembly.user).toContain('## Skills / rules');
    await app.close();
  });

  it('a skill disabled FOR THIS AGENT is absent from the prompt', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const agentId = await makeAgent(app);
    const on = await makeSkill(app, 'kept-rule');
    const off = await makeSkill(app, 'muted-rule');

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        skills: [
          { skill_id: on.id, enabled: true },
          { skill_id: off.id, enabled: false },
        ],
      },
    });

    const trace = await runAndTrace(app, pr.id, agentId);
    expect(trace.prompt_assembly.skills).toContain('kept-rule');
    expect(trace.prompt_assembly.skills).not.toContain('muted-rule');
    await app.close();
  });

  it('a skill disabled GLOBALLY is absent even while still linked', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const agentId = await makeAgent(app);
    const skill = await makeSkill(app, 'globally-off-rule');

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skill.id] },
    });
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } });

    const trace = await runAndTrace(app, pr.id, agentId);
    expect(trace.prompt_assembly.skills).toBeNull();
    await app.close();
  });

  it('an imported skill is wrapped as untrusted data in the prompt', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const agentId = await makeAgent(app);
    const imported = await makeSkill(app, 'from-the-internet', {
      source: 'imported_url',
      enabled: true,
    });

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [imported.id] },
    });

    const trace = await runAndTrace(app, pr.id, agentId);
    expect(trace.prompt_assembly.skills).toContain(
      '<untrusted source="skill:from-the-internet">',
    );
    await app.close();
  });

  it('logs the attached skills and their token cost in the run log', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const agentId = await makeAgent(app);
    const skill = await makeSkill(app, 'logged-rule');

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skill.id] },
    });

    const trace = await runAndTrace(app, pr.id, agentId);
    const line = (trace.log as { msg: string }[]).find((l) => l.msg.startsWith('skills:'));
    expect(line?.msg).toMatch(/1 of 1 linked skill\(s\) attached \(logged-rule\) — ~\d+ token/);
    await app.close();
  });
});
