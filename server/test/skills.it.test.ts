import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { makeZip } from './helpers/zip.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { Review, StructuredRequest } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * L02 — skills end to end against real Postgres: CRUD + versions, import
 * preview → confirm, the agent's ordered/enabled links, and the review run
 * putting ONLY enabled skills into the prompt (and the trace).
 */

const DIFF = `diff --git a/src/discount.ts b/src/discount.ts
--- a/src/discount.ts
+++ b/src/discount.ts
@@ -1,2 +1,3 @@
 export function discount(total: number) {
+  if (total >= 100) return total * 0.9;
   return total;`;

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

d('L02 skills (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let llm: MockLLMProvider;

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
    llm = new MockLLMProvider('openai', { structured: EMPTY_REVIEW });
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: DIFF }), llm: { openai: llm } },
    });
  }

  it('seeds Test Quality Reviewer with 3 skills and General Reviewer with the API skill', async () => {
    const app = await makeApp();
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json();
    const tq = agents.find((a: { name: string }) => a.name === 'Test Quality Reviewer');
    const general = agents.find((a: { name: string }) => a.name === 'General Reviewer');
    expect(tq.skill_count).toBe(3);
    expect(general.skill_count).toBe(1);
    await app.close();
  });

  it('creates, edits (new version) and lists versions of a skill', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'crud-skill', description: 'Use when X.', type: 'custom', body: 'v1 body' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;

    const dup = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'crud-skill', description: 'Use when X.', type: 'custom', body: 'b' },
    });
    expect(dup.statusCode).toBe(409);

    const edited = (
      await app.inject({
        method: 'PUT',
        url: `/skills/${id}`,
        payload: { body: 'v2 body', version_message: 'Tightened scope' },
      })
    ).json();
    expect(edited.version).toBe(2);

    // A note without a body change records nothing.
    const renamed = (
      await app.inject({
        method: 'PUT',
        url: `/skills/${id}`,
        payload: { description: 'Use when Y.', version_message: 'ignored' },
      })
    ).json();
    expect(renamed.version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number; message: string | null }) => [v.version, v.message])).toEqual([
      [2, 'Tightened scope'],
      [1, null],
    ]);
    await app.close();
  });

  it('import preview saves nothing; the confirmed import is created disabled', async () => {
    const app = await makeApp();
    const before = await pg.handle.db.select().from(t.skills);
    const zip = makeZip({
      'flaky-tests/SKILL.md': '---\nname: flaky-import\ndescription: Use when tests sleep.\n---\nFlag sleeps.',
      'flaky-tests/scripts/detect.sh': '#!/bin/sh\nexit 1',
    });
    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'flaky-tests.zip', content_base64: zip.toString('base64') },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().ignored_files).toEqual([
      { path: 'flaky-tests/scripts/detect.sh', reason: 'executable' },
    ]);
    expect(await pg.handle.db.select().from(t.skills)).toHaveLength(before.length);

    const p = preview.json();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: p.name, description: p.description, type: p.type, body: p.body, source: 'imported' },
      })
    ).json();
    expect(created).toMatchObject({ name: 'flaky-import', source: 'imported', enabled: false });
    await app.close();
  });

  it('runs a review with only the enabled skills, in order, and records them in the trace', async () => {
    const app = await makeApp();
    const mk = async (name: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/skills',
          payload: { name, description: `Use when ${name}.`, type: 'rubric', body: `BODY-${name}` },
        })
      ).json().id as string;
    const [first, second, off] = [await mk('run-first'), await mk('run-second'), await mk('run-off')];

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled', provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
      })
    ).json();

    // Order is second → off → first; `off` is linked but disabled.
    const links = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: {
        items: [
          { skill_id: second, enabled: true },
          { skill_id: off, enabled: false },
          { skill_id: first, enabled: true },
        ],
      },
    });
    expect(links.statusCode).toBe(200);
    expect(links.json().map((l: { enabled: boolean }) => l.enabled)).toEqual([true, false, true]);

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-repo', fullName: 'acme/skills-repo' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add discount',
        author: 'dev',
        branch: 'feat/d',
        base: 'main',
        headSha: 'abc',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/discount.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -1,2 +1,3 @@\n export function discount(total: number) {\n+  if (total >= 100) return total * 0.9;\n   return total;',
    });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    const [run] = await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });
    expect(run!.status).toBe('done');

    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const user = (call.req as StructuredRequest<unknown>).messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('## Skills / rules');
    expect(user).not.toContain('BODY-run-off');
    expect(user.indexOf('BODY-run-second')).toBeLessThan(user.indexOf('BODY-run-first'));

    const trace = (await app.inject({ method: 'GET', url: `/runs/${run!.id}/trace` })).json();
    expect(trace.prompt_assembly.skills_detail.map((s: { name: string }) => s.name)).toEqual([
      'run-second',
      'run-first',
    ]);
    expect(trace.prompt_assembly.block_tokens.skills).toBeGreaterThan(0);
    expect(trace.log.some((l: { msg: string }) => /Skills: 2 block\(s\)/.test(l.msg))).toBe(true);

    // Skill stats: the agent's one run pulled `run-second`; a resolved finding
    // of that run counts towards its accept rate and category breakdown.
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId: agent.id, runId: run!.id, kind: 'review' })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/discount.ts',
      startLine: 2,
      endLine: 2,
      severity: 'WARNING',
      category: 'bug',
      title: 'Boundary',
      rationale: 'r',
      confidence: 0.9,
      acceptedAt: new Date(),
    });
    const stats = (await app.inject({ method: 'GET', url: `/skills/${second}/stats` })).json();
    expect(stats).toMatchObject({
      agents: [{ id: agent.id, name: 'Skilled', enabled: true }],
      pull_rate: 1,
      accept_rate: 1,
      findings_30d: 1,
      by_category: [{ category: 'bug', count: 1 }],
    });
    const offStats = (await app.inject({ method: 'GET', url: `/skills/${off}/stats` })).json();
    expect(offStats).toMatchObject({ agents: [], pull_rate: null, findings_30d: 0 });
    const listedSkills = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(listedSkills.find((sk: { id: string }) => sk.id === second).stats).toEqual({
      agents: 1,
      pull_rate: 1,
      accept_rate: 1,
    });

    // Disabling the skill globally removes it from the next run's prompt too.
    await app.inject({ method: 'PUT', url: `/skills/${first}`, payload: { enabled: false } });
    const counts = (await app.inject({ method: 'GET', url: '/agents' })).json();
    const listed = counts.find((a: { id: string }) => a.id === agent.id);
    expect(listed.skill_count).toBe(1);
    // List-card stats: one completed run, priced; its one finding was accepted.
    expect(listed.stats.runs).toBe(1);
    expect(listed.stats.avg_cost_usd).toBeGreaterThan(0);
    expect(listed.stats.accept_rate).toBe(1);
    await app.close();
  });

  it('rejects linking a skill id that is not in the workspace', async () => {
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Linker', provider: 'openai', model: 'gpt-4.1', system_prompt: 'rev' },
      })
    ).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: { items: [{ skill_id: '00000000-0000-4000-8000-000000000000', enabled: true }] },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
