import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

  it('seed creates the 3 skills (with v1), 2 new agents and links, idempotently', async () => {
    await seed(pg.handle.db); // second run must not duplicate anything
    const db = pg.handle.db;
    const skills = await db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
    expect(skills.map((s) => s.name).sort()).toEqual([
      'api-contract-gate',
      'frontend-conventions',
      'test-coverage-nudge',
    ]);
    const versions = await db.select().from(t.skillVersions);
    expect(versions).toHaveLength(3);

    const agents = await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    const selfReview = agents.find((a) => a.name === 'pr-self-review');
    const testQuality = agents.find((a) => a.name === 'Test Quality Reviewer');
    expect(selfReview?.enabled).toBe(false);
    expect(testQuality?.enabled).toBe(true);

    const links = await db.select().from(t.agentSkills);
    expect(links).toHaveLength(3);
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

    const rows = await db
      .select()
      .from(t.agentRunSkills)
      .where(eq(t.agentRunSkills.agentRunId, runId));
    expect(rows.map((r) => r.skillId).sort()).toEqual([first.id, second.id].sort());
    expect(rows.some((r) => r.skillId === off.id || r.skillId === unlinked.id)).toBe(false);

    const user = (llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { content: string }[];
    }).messages[1]!.content;
    expect(user.indexOf('RUN-FIRST-BODY')).toBeGreaterThan(-1);
    expect(user.indexOf('RUN-FIRST-BODY')).toBeLessThan(user.indexOf('RUN-SECOND-BODY'));
    expect(user).not.toContain('RUN-OFF-BODY');
    expect(user).not.toContain('RUN-UNLINKED-BODY');

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.skills).toContain('RUN-FIRST-BODY');
    expect(trace.prompt_assembly.skills).toContain('RUN-SECOND-BODY');

    await app.close();
  });
});
