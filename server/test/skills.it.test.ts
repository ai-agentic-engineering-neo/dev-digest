import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import type { Review, Skill } from '@devdigest/shared';
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

const DIFF = `diff --git a/src/calc.ts b/src/calc.ts
--- a/src/calc.ts
+++ b/src/calc.ts
@@ -1,2 +1,4 @@
 export const x = 1;
+export function half(n: number) {
+  return n === 0 ? 0 : n / 2;
+}`;

const finding = (id: string, category: 'bug' | 'style' | 'perf', line: number) => ({
  id, severity: 'WARNING' as const, category, title: `t-${id}`, file: 'src/calc.ts',
  start_line: line, end_line: line, rationale: 'r', confidence: 0.9, kind: 'finding' as const,
});
const EMPTY_REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Findings.',
  score: 50,
  findings: [finding('f1', 'bug', 3), finding('f2', 'bug', 3), finding('f3', 'style', 2), finding('f4', 'perf', 2)],
};

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const IMPORT_MD = `---
name: imported-rubric
description: Use when tests use timers. Flag real sleeps.
type: rubric
---
# Timers
Prefer fake timers over real sleeps.
`;

d('skills module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: EMPTY_REVIEW }),
          anthropic: new MockLLMProvider('anthropic', { structured: EMPTY_REVIEW }),
          // the seeded reviewers default to the openrouter provider
          openrouter: new MockLLMProvider('openrouter', { structured: EMPTY_REVIEW }),
        },
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const agentByName = async (name: string) => {
    const [row] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, name)));
    return row!;
  };
  const links = async (agentId: string) =>
    (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json() as Array<{
      skill_id: string;
      order: number;
      enabled: boolean;
    }>;
  const skillByName = async (name: string) => {
    const all = (await app.inject({ method: 'GET', url: '/skills' })).json() as Skill[];
    return all.find((s) => s.name === name)!;
  };

  it('seeds Test Quality and API Contract reviewers with their skills, in order', async () => {
    for (const [agent, names] of [
      ['Test Quality Reviewer', ['test-branch-coverage', 'test-mocking-discipline']],
      ['API Contract Reviewer', ['api-breaking-changes', 'contract-sync-discipline']],
    ] as const) {
      const a = await agentByName(agent);
      const ls = await links(a.id);
      expect(ls.map((l) => l.order)).toEqual([0, 1]);
      expect(ls.every((l) => l.enabled)).toBe(true);
      const ids = await Promise.all(names.map(async (n) => (await skillByName(n)).id));
      expect(ls.map((l) => l.skill_id)).toEqual(ids);
    }
    // re-seeding is idempotent
    await seed(pg.handle.db);
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(4);
  });

  it('CRUD: create, duplicate name → 409, edit body bumps version + snapshot, toggle, delete', async () => {
    const payload = { name: 'crud-skill', description: 'Use when testing.', type: 'custom', body: 'v1 body' };
    const created = await app.inject({ method: 'POST', url: '/skills', payload });
    expect(created.statusCode).toBe(201);
    const skill = created.json() as Skill;
    expect(skill).toMatchObject({ source: 'manual', enabled: true, version: 1 });

    const dup = await app.inject({ method: 'POST', url: '/skills', payload: { ...payload, name: 'CRUD-Skill' } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('skill_name_taken');

    const invalid = await app.inject({ method: 'POST', url: '/skills', payload: { ...payload, name: '', body: '' } });
    expect(invalid.statusCode).toBe(422);

    const edited = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'v2 body' } });
    expect(edited.json()).toMatchObject({ version: 2, body: 'v2 body' });
    const toggled = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } });
    expect(toggled.json()).toMatchObject({ enabled: false, version: 2 }); // no body change ⇒ no bump
    const versions = await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, skill.id));
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);

    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json().body).toBe('v2 body');
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(404);
  });

  it('import: preview stores nothing; only the confirm (POST /skills) stores', async () => {
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    const archive = zipSync({
      'pack/SKILL.md': strToU8(IMPORT_MD),
      'pack/scripts/run.sh': strToU8('#!/bin/sh\necho hi'),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'pack.zip', content_base64: b64(archive) },
    });
    expect(res.statusCode).toBe(200);
    const preview = res.json();
    expect(preview).toMatchObject({ name: 'imported-rubric', type: 'rubric', ignored_entries: ['pack/scripts/run.sh'] });
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    const { source_file: _s, ignored_entries: _i, warnings: _w, truncated: _t, ...fields } = preview;
    const confirmed = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...fields, source: 'imported_file' },
    });
    expect(confirmed.statusCode).toBe(201);
    expect(confirmed.json()).toMatchObject({ name: 'imported-rubric', source: 'imported_file' });
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before + 1);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.exe', content_base64: b64(strToU8('MZ')) },
    });
    expect(bad.statusCode).toBe(422);
    const huge = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.md', content_base64: 'A'.repeat(700_000) },
    });
    expect(huge.statusCode).toBe(413);
  });

  it('agent links: per-agent switch, reorder keeps switches, unknown ids rejected, unlink', async () => {
    const agent = await agentByName('Test Quality Reviewer');
    const [first, second] = await links(agent.id);

    const off = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills/${first!.skill_id}`,
      payload: { enabled: false },
    });
    expect(off.statusCode).toBe(200);
    expect((await links(agent.id)).find((l) => l.skill_id === first!.skill_id)!.enabled).toBe(false);

    // reorder: swap — the disabled switch must survive
    const reordered = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [second!.skill_id, first!.skill_id] },
    });
    expect(reordered.json().map((l: { skill_id: string; enabled: boolean }) => [l.skill_id, l.enabled])).toEqual([
      [second!.skill_id, true],
      [first!.skill_id, false],
    ]);

    const unknown = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: ['00000000-0000-4000-8000-000000000000'] },
    });
    expect(unknown.statusCode).toBe(422);

    const missing = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/skills/00000000-0000-4000-8000-000000000000`,
      payload: { enabled: true },
    });
    expect(missing.statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/agents/${agent.id}/skills/${first!.skill_id}`, payload: {} })).statusCode,
    ).toBe(422);

    const del = await app.inject({ method: 'DELETE', url: `/agents/${agent.id}/skills/${first!.skill_id}` });
    expect(del.json()).toHaveLength(1);
    // restore for the tests below
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [first!.skill_id, second!.skill_id] } });
    expect((await links(agent.id)).map((l) => l.enabled)).toEqual([true, true]);
  });

  it('prompt: a skill reaches the run only when skill AND link are enabled, in link order, with tokens logged', async () => {
    const agent = await agentByName('API Contract Reviewer');
    const [a, b] = await links(agent.id);
    const [skillA, skillB] = await Promise.all(
      [a!, b!].map(async (l) => (await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, l.skill_id)))[0]!),
    );

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-prompt', fullName: 'acme/skills-prompt' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 7, title: 'Halve', author: 'a', branch: 'f', base: 'main',
        headSha: 'abc', additions: 3, deletions: 0, filesCount: 1, status: 'needs_review', body: '',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id, path: 'src/calc.ts', additions: 3, deletions: 0,
      patch: '@@ -1,2 +1,4 @@\n export const x = 1;\n+export function half(n: number) {\n+  return n === 0 ? 0 : n / 2;\n+}',
    });

    const runOnce = async (expected: number) => {
      await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
      const runs = await waitForPrRuns(pg.handle.db, pr!.id, { expected });
      const last = runs.sort((x, y) => (x.ranAt < y.ranAt ? -1 : 1)).at(-1)!;
      expect(last.status).toBe('done');
      return (await app.inject({ method: 'GET', url: `/runs/${last.id}/trace` })).json();
    };
    const setLink = (skillId: string, enabled: boolean) =>
      app.inject({ method: 'PUT', url: `/agents/${agent.id}/skills/${skillId}`, payload: { enabled } });

    // both on → both blocks, link order, a tokens line in the log
    const both = await runOnce(1);
    const skillsBlock: string = both.prompt_assembly.skills;
    expect(skillsBlock).toContain(`### ${skillA.name}`);
    expect(skillsBlock).toContain(`### ${skillB.name}`);
    expect(skillsBlock.indexOf(skillA.name)).toBeLessThan(skillsBlock.indexOf(skillB.name));
    expect(JSON.stringify(both.log)).toMatch(/skills: 2 attached \(\+~\d+ tokens\)/);

    // link switch off on A → only B
    await setLink(skillA.id, false);
    const onlyB = await runOnce(2);
    expect(onlyB.prompt_assembly.skills).not.toContain(skillA.name);
    expect(onlyB.prompt_assembly.skills).toContain(`### ${skillB.name}`);
    expect(JSON.stringify(onlyB.log)).toMatch(/skills: 1 attached/);

    // skill itself off on B → nothing, and no `skills:` log line at all
    await app.inject({ method: 'PUT', url: `/skills/${skillB.id}`, payload: { enabled: false } });
    const none = await runOnce(3);
    expect(none.prompt_assembly.skills ?? null).toBeNull();
    expect(JSON.stringify(none.log)).not.toMatch(/skills: \d+ attached/);
  });

  it('stats: pull rate, accept rate, categories, agents; unknown / malformed ids', async () => {
    const agent = await agentByName('API Contract Reviewer');
    const [a, b] = await links(agent.id);
    const skillA = (await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, a!.skill_id)))[0]!;
    const noRuns = await skillByName('test-branch-coverage'); // linked to another agent that never ran

    // skills-prompt (above) already left 3 done runs for this agent; use a fresh PR for exact counts.
    const before = (await app.inject({ method: 'GET', url: `/skills/${skillA.id}/stats` })).json();
    expect(before.agents).toEqual([{ id: agent.id, name: agent.name, enabled: false }]); // still off from the prompt test
    await app.inject({ method: 'PUT', url: `/agents/${agent.id}/skills/${skillA.id}`, payload: { enabled: true } });
    await app.inject({ method: 'PUT', url: `/skills/${skillA.id}`, payload: { enabled: true } });
    await app.inject({ method: 'PUT', url: `/skills/${b!.skill_id}`, payload: { enabled: true } });

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-stats', fullName: 'acme/skills-stats' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 8, title: 'Halve', author: 'a', branch: 'f', base: 'main',
        headSha: 'abc', additions: 3, deletions: 0, filesCount: 1, status: 'needs_review', body: '',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id, path: 'src/calc.ts', additions: 3, deletions: 0,
      patch: '@@ -1,2 +1,4 @@\n export const x = 1;\n+export function half(n: number) {\n+  return n === 0 ? 0 : n / 2;\n+}',
    });
    const runOnce = async (expected: number) => {
      await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
      const runs = await waitForPrRuns(pg.handle.db, pr!.id, { expected });
      expect(runs.filter((r) => r.status === 'done')).toHaveLength(expected);
    };
    const statsOf = async (id: string) => (await app.inject({ method: 'GET', url: `/skills/${id}/stats` })).json();
    const base = await statsOf(skillA.id);

    await runOnce(1);
    const s1 = await statsOf(skillA.id);
    expect(s1.runs_total - base.runs_total).toBe(1);
    expect(s1.runs_pulled - base.runs_pulled).toBe(1);
    expect(s1.findings_total - base.findings_total).toBeGreaterThan(0);

    // decide two findings of this run: accept one, dismiss another
    const found = await pg.handle.db
      .select({ id: t.findings.id, category: t.findings.category })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(eq(t.reviews.prId, pr!.id));
    expect(found.length).toBeGreaterThanOrEqual(2);
    await app.inject({ method: 'POST', url: `/findings/${found[0]!.id}/accept` });
    await app.inject({ method: 'POST', url: `/findings/${found[1]!.id}/dismiss` });
    await app.inject({ method: 'POST', url: `/findings/${found[1]!.id}/dismiss` });

    const s2 = await statsOf(skillA.id);
    expect(s2.findings_accepted - base.findings_accepted).toBe(1);
    expect(s2.findings_dismissed - base.findings_dismissed).toBe(1);
    expect(s2.accept_rate).toBeCloseTo(s2.findings_accepted / (s2.findings_accepted + s2.findings_dismissed));
    expect(s2.window_days).toBe(30);
    expect(s2.agents_count).toBe(1);
    expect(s2.agents).toEqual([{ id: agent.id, name: agent.name, enabled: true }]);
    const byCat = Object.fromEntries(s2.by_category.map((c: { category: string; count: number }) => [c.category, c.count]));
    expect(s2.by_category.reduce((n: number, c: { count: number }) => n + c.count, 0)).toBe(s2.findings_total);
    expect(byCat.bug).toBeGreaterThanOrEqual(1);
    const counts = s2.by_category.map((c: { count: number }) => c.count);
    expect(counts).toEqual([...counts].sort((x: number, y: number) => y - x));

    // switching the link off: the next run does NOT pull the skill → rate drops below the old one
    await app.inject({ method: 'PUT', url: `/agents/${agent.id}/skills/${skillA.id}`, payload: { enabled: false } });
    await runOnce(2);
    const s3 = await statsOf(skillA.id);
    expect(s3.runs_total - s2.runs_total).toBe(1);
    expect(s3.runs_pulled).toBe(s2.runs_pulled);
    expect(s3.pull_rate).toBeLessThan(s2.pull_rate);
    expect(s3.pull_rate).toBeCloseTo(s3.runs_pulled / s3.runs_total);
    expect(s3.agents[0].enabled).toBe(false);

    // summary: all skills, same numbers as the detail view; static route not shadowed by /skills/:id
    const summaryRes = await app.inject({ method: 'GET', url: '/skills/stats' });
    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json() as Array<Record<string, unknown>>;
    const all = (await app.inject({ method: 'GET', url: '/skills' })).json() as Skill[];
    expect(summary.map((x) => x.skill_id).sort()).toEqual(all.map((x) => x.id).sort());
    expect(summary.find((x) => x.skill_id === skillA.id)).toEqual({
      skill_id: skillA.id, agents_count: 1, pull_rate: s3.pull_rate, accept_rate: s3.accept_rate,
    });
    expect(Object.keys(summary[0]!).sort()).toEqual(['accept_rate', 'agents_count', 'pull_rate', 'skill_id']);

    // a skill whose agents never ran → nulls
    const idle = await statsOf(noRuns.id);
    expect(idle).toMatchObject({ runs_total: 0, runs_pulled: 0, pull_rate: null, accept_rate: null, findings_total: 0, by_category: [] });
    expect(idle.agents_count).toBeGreaterThan(0);

    const missing = await app.inject({ method: 'GET', url: '/skills/00000000-0000-4000-8000-000000000000/stats' });
    expect(missing.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/skills/not-a-uuid/stats' })).statusCode).toBe(422);
  });
});
