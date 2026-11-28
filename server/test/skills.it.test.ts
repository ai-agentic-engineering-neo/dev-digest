import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/refund.ts b/src/refund.ts
--- a/src/refund.ts
+++ b/src/refund.ts
@@ -1,2 +1,3 @@
 export function refund() {
+  if (amount > captured) throw new Error('too much');
 }`;

const REVIEW: Review = {
  verdict: 'comment',
  summary: 'Untested branch.',
  score: 80,
  findings: [
    {
      id: 'f1',
      severity: 'WARNING',
      category: 'test',
      title: 'Branch amount > captured has no test',
      file: 'src/refund.ts',
      start_line: 2,
      end_line: 2,
      rationale: 'New branch is not covered.',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

/**
 * M2 skills — CRUD + versioning + restore, import (preview persists nothing),
 * agent links (order, per-agent enabled, cross-workspace refusal), and the run
 * path: only enabled skills reach the SYSTEM prompt, the trace carries per-skill
 * tokens, and agent_run_skills feeds the Stats tab.
 */
d('M2 skills (Testcontainers pg)', () => {
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
    llm = new MockLLMProvider('openai', { structured: REVIEW });
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });
  }

  async function createSkill(app: Awaited<ReturnType<typeof makeApp>>, name: string, body = `Body of ${name}`) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: `Flag ${name}`, type: 'rubric', body },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number };
  }

  it('CRUD + body versioning + restore', async () => {
    const app = await makeApp();
    const s = await createSkill(app, 'it-crud', 'v1 body');
    expect(s.version).toBe(1);

    // duplicate name → 409
    const dup = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'it-crud', description: 'x', type: 'custom' },
    });
    expect(dup.statusCode).toBe(409);

    // metadata-only edit: no new version
    const meta = await app.inject({ method: 'PUT', url: `/skills/${s.id}`, payload: { description: 'Flag it directive' } });
    expect(meta.json().version).toBe(1);

    // body edit: v2 with note
    const v2 = await app.inject({
      method: 'PUT',
      url: `/skills/${s.id}`,
      payload: { body: 'v2 body', change_note: 'Tightened' },
    });
    expect(v2.json().version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({ change_note: 'Tightened', current: true });
    expect(versions[1]).toMatchObject({ change_note: 'Initial version', current: false });

    const one = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions/1` })).json();
    expect(one.body).toBe('v1 body');

    // restore v1 → v3 with v1's body; history kept
    const restored = (await app.inject({ method: 'POST', url: `/skills/${s.id}/versions/1/restore` })).json();
    expect(restored).toMatchObject({ version: 3, body: 'v1 body' });
    const after = (await app.inject({ method: 'GET', url: `/skills/${s.id}/versions` })).json();
    expect(after[0]).toMatchObject({ version: 3, change_note: 'Restored from v1' });

    // preview = the system-prompt block + tokens
    const preview = (await app.inject({ method: 'GET', url: `/skills/${s.id}/preview` })).json();
    expect(preview.block).toBe('### Skill: it-crud\n\nv1 body');
    expect(preview.tokens).toBeGreaterThan(0);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${s.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/skills/${s.id}` })).statusCode).toBe(404);
  });

  it('import: preview persists nothing; confirm requires trust and saves as imported_file', async () => {
    const app = await makeApp();
    const before = await pg.handle.db.select().from(t.skills);
    const zip = zipSync({
      'it-imported/SKILL.md': strToU8('---\nname: it-imported\ndescription: Flag flaky tests\n---\nNo sleeps.'),
      'it-imported/scripts/evil.sh': strToU8('rm -rf ~'),
    });
    const prev = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { file_name: 'it.zip', content_base64: Buffer.from(zip).toString('base64') },
    });
    expect(prev.statusCode).toBe(200);
    expect(prev.json()).toMatchObject({
      name: 'it-imported',
      body: 'No sleeps.',
      skipped_files: ['it-imported/scripts/evil.sh'],
    });
    expect(await pg.handle.db.select().from(t.skills)).toHaveLength(before.length);

    const noTrust = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { name: 'it-imported', description: 'd', type: 'custom', body: 'No sleeps.', trusted: false },
    });
    expect(noTrust.statusCode).toBe(422);

    const saved = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { name: 'it-imported', description: 'Flag flaky tests', type: 'custom', body: 'No sleeps.', trusted: true },
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().source).toBe('imported_file');
  });

  it('agent links: order + per-agent enabled; foreign skills refused; version bumps', async () => {
    const app = await makeApp();
    const a = await createSkill(app, 'it-link-a');
    const b = await createSkill(app, 'it-link-b');
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Linker', provider: 'openai', model: 'gpt-4.1', system_prompt: 'p' },
      })
    ).json();

    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: b.id, enabled: true }, { skill_id: a.id, enabled: false }] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().map((l: { name: string; enabled: boolean; order: number }) => [l.name, l.enabled, l.order])).toEqual([
      ['it-link-b', true, 0],
      ['it-link-a', false, 1],
    ]);
    const versions = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions` })).json();
    expect(versions[0].version).toBe(2);
    expect(versions[0].config.skills).toEqual([b.id]);

    // a skill from another workspace can never be linked
    const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: 'Other' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId: ws2!.id, name: 'foreign', description: 'd', type: 'custom', source: 'manual', body: 'x' })
      .returning();
    const bad = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: foreign!.id, enabled: true }] },
    });
    expect(bad.statusCode).toBe(422);
  });

  it('run: only enabled skills reach the system prompt; trace + agent_run_skills + stats', async () => {
    const app = await makeApp();
    const on = await createSkill(app, 'it-run-on', 'Flag untested branches.');
    const off = await createSkill(app, 'it-run-off', 'SHOULD NOT APPEAR');
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Test Quality IT', provider: 'openai', model: 'gpt-4.1', system_prompt: 'AGENT' },
      })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills`,
      payload: { skills: [{ skill_id: on.id, enabled: true }, { skill_id: off.id, enabled: false }] },
    });

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-it', fullName: 'acme/skills-it' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 900, title: 'Refund', author: 'a', branch: 'b',
        base: 'main', headSha: 'abc', additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
      })
      .returning();

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });

    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const system = (call.req as { messages: { role: string; content: string }[] }).messages[0]!.content;
    expect(system).toContain('### Skill: it-run-on');
    expect(system).not.toContain('SHOULD NOT APPEAR');
    expect(system.indexOf('### Skill: it-run-on')).toBeGreaterThan(system.indexOf('AGENT'));

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    const [runRow] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(runRow?.error ?? null).toBeNull();
    expect(trace.prompt_assembly.skill_blocks).toHaveLength(1);
    expect(trace.prompt_assembly.skill_blocks[0]).toMatchObject({ name: 'it-run-on', source: 'manual', version: 1 });
    expect(trace.prompt_assembly.skills_tokens).toBeGreaterThan(0);
    expect(trace.log.some((l: { msg: string }) => l.msg.startsWith('Skills: 1 enabled'))).toBe(true);

    const rows = await pg.handle.db.select().from(t.agentRunSkills).where(eq(t.agentRunSkills.runId, runId));
    expect(rows.map((r) => r.skillId)).toEqual([on.id]);

    const stats = (await app.inject({ method: 'GET', url: `/skills/${on.id}/stats` })).json();
    expect(stats).toMatchObject({ pull_rate: 1, findings_30d: 1, by_category: [{ category: 'test', count: 1 }] });
    expect(stats.used_by.map((u: { name: string }) => u.name)).toEqual(['Test Quality IT']);
    expect(stats.accept_rate).toBeNull();

    const offStats = (await app.inject({ method: 'GET', url: `/skills/${off.id}/stats` })).json();
    expect(offStats).toMatchObject({ used_by: [], findings_30d: 0 });

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const card = list.find((s: { id: string }) => s.id === on.id);
    expect(card.stats).toMatchObject({ agents_count: 1, pull_rate: 1 });

    // Global kill switch: disabling the skill on the Skills page removes it from
    // every agent's prompt even though the agent link stays enabled.
    await app.inject({ method: 'PUT', url: `/skills/${on.id}`, payload: { enabled: false } });
    const agentNow = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(agentNow.skill_count).toBe(0);
    llm.calls.length = 0;
    await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 2 });
    const call2 = llm.calls.find((c) => c.method === 'completeStructured')!;
    const system2 = (call2.req as { messages: { content: string }[] }).messages[0]!.content;
    expect(system2).not.toContain('## Skills');
  });
});
