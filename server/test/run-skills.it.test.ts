import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const APPROVE = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

d('linked skills in a live run (Testcontainers pg)', () => {
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

  it('seed creates the 7 skills (with v1), 6 agents and 7 links, idempotently', async () => {
    await seed(pg.handle.db); // second run must not duplicate anything
    const db = pg.handle.db;
    const skills = await db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
    expect(skills.map((s) => s.name).sort()).toEqual([
      'api-contract-gate',
      'breaking-change',
      'deprecation-policy',
      'frontend-conventions',
      'response-schema',
      'semver-discipline',
      'test-coverage-nudge',
    ]);
    const versions = await db.select().from(t.skillVersions);
    expect(versions).toHaveLength(7);

    const agents = await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    expect(agents.map((a) => a.name).sort()).toEqual([
      'API Contract Reviewer',
      'General Reviewer',
      'Performance Reviewer',
      'Security Reviewer',
      'Test Quality Reviewer',
      'pr-self-review',
    ]);
    const selfReview = agents.find((a) => a.name === 'pr-self-review');
    const testQuality = agents.find((a) => a.name === 'Test Quality Reviewer');
    const apiContract = agents.find((a) => a.name === 'API Contract Reviewer');
    expect(selfReview?.enabled).toBe(false);
    expect(testQuality?.enabled).toBe(true);
    expect(apiContract?.enabled).toBe(true);

    const links = await db.select().from(t.agentSkills);
    expect(links).toHaveLength(7);

    // API Contract Reviewer links its 4 skills in this exact order.
    const skillName = new Map(skills.map((s) => [s.id, s.name]));
    const apiLinks = links
      .filter((l) => l.agentId === apiContract!.id)
      .sort((a, b) => a.order - b.order)
      .map((l) => skillName.get(l.skillId));
    expect(apiLinks).toEqual([
      'breaking-change',
      'response-schema',
      'semver-discipline',
      'deprecation-policy',
    ]);

    // Origin (criterion 16): deprecation-policy is file-imported ('extracted');
    // the other seeded skills are 'manual'.
    const bySource = (name: string) => skills.find((s) => s.name === name)?.source;
    expect(bySource('deprecation-policy')).toBe('extracted');
    expect(bySource('breaking-change')).toBe('manual');
    expect(bySource('test-coverage-nudge')).toBe('manual');

    // Each API Contract skill body carries a directive + a good/bad example, and
    // test-coverage-nudge explicitly directs boundary + uncovered-branch flagging.
    for (const name of ['breaking-change', 'response-schema', 'semver-discipline', 'deprecation-policy']) {
      const body = skills.find((s) => s.name === name)!.body;
      expect(body).toContain('## Directive');
      expect(body).toContain('## Good');
      expect(body).toContain('## Bad');
    }
    const nudge = skills.find((s) => s.name === 'test-coverage-nudge')!.body;
    expect(nudge).toContain('Uncovered branches');
    expect(nudge).toContain('Boundary cases');
  });

  it('records active skills on a completed run, passes bodies in order, skips disabled', async () => {
    const db = pg.handle.db;
    const llm = new MockLLMProvider('openai', { structured: APPROVE });
    const app = await buildApp({
      config: config(),
      db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-run', fullName: 'acme/skills-run' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Add key',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'body',
      })
      .returning();

    const mkSkill = async (name: string, body: string, enabled: boolean) => {
      const [s] = await db
        .insert(t.skills)
        .values({ workspaceId, name, description: name, type: 'custom', source: 'manual', body, enabled })
        .returning();
      return s!;
    };
    const first = await mkSkill('run-first', 'RUN-FIRST-BODY', true);
    const second = await mkSkill('run-second', 'RUN-SECOND-BODY', true);
    const off = await mkSkill('run-off', 'RUN-OFF-BODY', false);
    const unlinked = await mkSkill('run-unlinked', 'RUN-UNLINKED-BODY', true);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skill Runner', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json();
    // Insert out of order on purpose: `order` (not insertion order) must win.
    await db.insert(t.agentSkills).values([
      { agentId: agent.id, skillId: second.id, order: 1 },
      { agentId: agent.id, skillId: off.id, order: 2 },
      { agentId: agent.id, skillId: first.id, order: 0 },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(db, pr!.id, { expected: 1 });

    // `recordRunSkills` runs just AFTER the run is marked done (run-executor), so the
    // row can lag `waitForPrRuns` under load — poll instead of reading once.
    const rows = await vi.waitFor(
      async () => {
        const found = await db
          .select()
          .from(t.agentRunSkills)
          .where(eq(t.agentRunSkills.agentRunId, runId));
        if (found.length === 0) throw new Error('agent_run_skills not recorded yet');
        return found;
      },
      { timeout: 5000, interval: 50 },
    );
    expect(rows.map((r) => r.skillId).sort()).toEqual([first.id, second.id].sort());
    expect(rows.some((r) => r.skillId === off.id || r.skillId === unlinked.id)).toBe(false);

    const user = (llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { content: string }[];
    }).messages[1]!.content;
    expect(user.indexOf('RUN-FIRST-BODY')).toBeGreaterThan(-1);
    expect(user.indexOf('RUN-FIRST-BODY')).toBeLessThan(user.indexOf('RUN-SECOND-BODY'));
    expect(user).not.toContain('RUN-OFF-BODY');
    expect(user).not.toContain('RUN-UNLINKED-BODY');

    // Same lag as above: the trace is persisted after the run flips to done.
    const trace = await vi.waitFor(
      async () => {
        const body = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
        if (!body?.prompt_assembly) throw new Error('trace not persisted yet');
        return body;
      },
      { timeout: 5000, interval: 50 },
    );
    expect(trace.prompt_assembly.skills).toContain('RUN-FIRST-BODY');
    expect(trace.prompt_assembly.skills).toContain('RUN-SECOND-BODY');

    await app.close();
  });
});
