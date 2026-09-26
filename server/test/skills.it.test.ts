import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { SEED_SKILLS, AGENT_SKILL_LINKS } from '../src/db/seed-skills.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const APPROVE: Review = { verdict: 'approve', summary: 'Looks fine.', score: 100, findings: [] };

/**
 * L02 skills — the DB-backed half. Covers: the seed (six skills, three linked
 * to Security Reviewer, `skill_count`), the skills CRUD with body versioning
 * and name uniqueness, agent link validation + versioning through
 * `POST /agents/:id/skills`, and the prompt: linked + enabled skills reach
 * `prompt_assembly.skills` in link order, disabled ones do not.
 */
d('L02 skills (Testcontainers pg)', () => {
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

  function makeApp(structured: unknown = APPROVE) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured }) },
      },
    });
  }

  async function securityReviewer(app: Awaited<ReturnType<typeof makeApp>>) {
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as Array<{
      id: string;
      name: string;
      skill_count: number;
      version: number;
    }>;
    return agents.find((a) => a.name === 'Security Reviewer')!;
  }

  it('seed: every skill present, links per agent in prompt order, skill_count on the agent', async () => {
    const app = await makeApp();
    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{ id: string; name: string; agent_count: number }>;
    expect(skills.map((s) => s.name).sort()).toEqual([...SEED_SKILLS.map((s) => s.name)].sort());

    const sec = await securityReviewer(app);
    expect(sec.skill_count).toBe(3);
    // agent_count on the skill side: pr-quality-rubric is linked by Security Reviewer only
    expect(skills.find((s) => s.name === 'pr-quality-rubric')).toMatchObject({ agent_count: 1 });
    const links = (await app.inject({ method: 'GET', url: `/agents/${sec.id}/skills` })).json() as Array<{
      skill_id: string;
      order: number;
    }>;
    const byId = new Map(skills.map((s) => [s.id, s.name]));
    expect(links.map((l) => byId.get(l.skill_id))).toEqual([...AGENT_SKILL_LINKS['Security Reviewer']!]);

    // The two lesson agents ship with their skills linked too.
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as Array<{ name: string; skill_count: number }>;
    for (const [name, wanted] of Object.entries(AGENT_SKILL_LINKS)) {
      expect(agents.find((a) => a.name === name)?.skill_count, name).toBe(wanted.length);
    }

    // Every seeded skill has its v1 snapshot.
    const versions = await pg.handle.db.select().from(t.skillVersions);
    expect(versions.length).toBeGreaterThanOrEqual(SEED_SKILLS.length);
    await app.close();
  });

  it('CRUD: a body edit bumps the version and snapshots it; metadata does not; names are unique', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'my-rule', description: 'd', type: 'custom', body: 'Original.' },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'my-rule', source: 'manual', enabled: true, version: 1 });

    const dup = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'my-rule', type: 'custom', body: 'x' },
    });
    expect(dup.statusCode).toBe(409);

    const meta = (
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false, type: 'rubric' } })
    ).json();
    expect(meta).toMatchObject({ enabled: false, type: 'rubric', version: 1 });

    const bumped = (
      await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'Changed.' } })
    ).json();
    expect(bumped).toMatchObject({ body: 'Changed.', version: 2 });
    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(versions.map((v) => [v.version, v.body]).sort()).toEqual([
      [1, 'Original.'],
      [2, 'Changed.'],
    ]);

    // versions: newest first; diff v1 → current; restore v1 appends v3 with the old body
    const versionsRes = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versionsRes.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const diffRes = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/1/diff` })).json();
    expect(diffRes).toMatchObject({ from_version: 1, to_version: 2, additions: 1, deletions: 1 });
    expect(diffRes.patch).toContain('-Original.');
    expect(diffRes.patch).toContain('+Changed.');
    const restored = (await app.inject({ method: 'POST', url: `/skills/${skill.id}/versions/1/restore` })).json();
    expect(restored).toMatchObject({ version: 3, body: 'Original.' });

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('agent links: reorder bumps the agent version and snapshots the set; identical set is a no-op; unknown id is 422', async () => {
    const app = await makeApp();
    const sec = await securityReviewer(app);
    const before = sec.version;
    const links = (await app.inject({ method: 'GET', url: `/agents/${sec.id}/skills` })).json() as Array<{
      skill_id: string;
    }>;
    const ids = links.map((l) => l.skill_id);

    const same = await app.inject({ method: 'POST', url: `/agents/${sec.id}/skills`, payload: { skill_ids: ids } });
    expect(same.statusCode).toBe(200);
    expect((await securityReviewer(app)).version).toBe(before);

    const reversed = [...ids].reverse();
    const re = await app.inject({ method: 'POST', url: `/agents/${sec.id}/skills`, payload: { skill_ids: reversed } });
    expect(re.statusCode).toBe(200);
    expect((re.json() as Array<{ skill_id: string; order: number }>).map((l) => l.skill_id)).toEqual(reversed);
    const after = await securityReviewer(app);
    expect(after.version).toBe(before + 1);
    const snapshot = (
      await app.inject({ method: 'GET', url: `/agents/${sec.id}/versions/${after.version}` })
    ).json();
    expect(snapshot.config.skills).toEqual(reversed);

    const bad = await app.inject({
      method: 'POST',
      url: `/agents/${sec.id}/skills`,
      payload: { skill_ids: ['33333333-3333-4333-8333-333333333333'] },
    });
    expect(bad.statusCode).toBe(422);

    // unlink everything → skill_count 0, version bumped again
    await app.inject({ method: 'POST', url: `/agents/${sec.id}/skills`, payload: { skill_ids: [] } });
    const emptied = await securityReviewer(app);
    expect(emptied.skill_count).toBe(0);
    expect(emptied.version).toBe(before + 2);

    // restore the seeded links for later tests
    await app.inject({ method: 'POST', url: `/agents/${sec.id}/skills`, payload: { skill_ids: ids } });
    await app.close();
  });

  it('prompt: linked enabled skills reach `## Skills / rules` in link order; a globally disabled skill is left out', async () => {
    const app = await makeApp();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-api', fullName: 'acme/skills-api' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add config',
        author: 'dev',
        branch: 'feat/cfg',
        base: 'main',
        headSha: 'deadbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{ id: string; name: string }>;
    const id = (name: string) => skills.find((s) => s.id && s.name === name)!.id;
    // Disable one of the linked skills globally on the Skills page.
    await app.inject({ method: 'PUT', url: `/skills/${id('secret-leakage-gate')}`, payload: { enabled: false } });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [id('lethal-trifecta'), id('secret-leakage-gate'), id('pr-quality-rubric')] },
    });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    const block = trace.prompt_assembly.skills as string;
    // per-skill trace blocks with tokenizer counts, in link order, disabled one absent
    expect(trace.prompt_assembly.skill_blocks.map((b: { name: string }) => b.name)).toEqual(['lethal-trifecta', 'pr-quality-rubric']);
    expect(trace.prompt_assembly.skill_blocks.every((b: { tokens: number }) => b.tokens > 0)).toBe(true);
    expect(trace.prompt_assembly.skills_tokens).toBe(
      trace.prompt_assembly.skill_blocks.reduce((n: number, b: { tokens: number }) => n + b.tokens, 0),
    );
    expect(trace.log.some((l: { msg: string }) => /Skill attached: lethal-trifecta \(v\d+, \d+ tokens\)/.test(l.msg))).toBe(true);
    expect(trace.log.some((l: { msg: string }) => l.msg.includes('secret-leakage-gate'))).toBe(false);
    expect(block).toContain('### lethal-trifecta');
    expect(block).toContain('### pr-quality-rubric');
    expect(block).not.toContain('secret-leakage-gate');
    expect(block.indexOf('### lethal-trifecta')).toBeLessThan(block.indexOf('### pr-quality-rubric'));
    // The user message the model saw carries the slot too.
    expect(trace.prompt_assembly.user).toContain('## Skills / rules');

    // An agent with no links gets no slot at all.
    const bare = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Bare', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      })
    ).json();
    const res2 = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: bare.id } });
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 2 });
    const trace2 = (await app.inject({ method: 'GET', url: `/runs/${res2.json().runs[0].run_id}/trace` })).json();
    expect(trace2.prompt_assembly.skills ?? null).toBeNull();
    expect(trace2.prompt_assembly.skill_blocks ?? null).toBeNull();
    expect(trace2.prompt_assembly.user).not.toContain('## Skills / rules');

    // Restore for any later test.
    await app.inject({ method: 'PUT', url: `/skills/${id('secret-leakage-gate')}`, payload: { enabled: true } });
    await pg.handle.db.delete(t.repos).where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repo!.id)));
    await app.close();
  });
});
