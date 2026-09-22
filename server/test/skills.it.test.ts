import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

function b64(bytes: Uint8Array | string): string {
  return Buffer.from(bytes).toString('base64');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 100,
  findings: [],
};

/**
 * A1 — skills module: CRUD, version history/restore, and the file-import
 * preview endpoint, run against a real (Testcontainers) Postgres. Also
 * verifies the wiring in `run-executor.ts`: only ENABLED linked skills reach
 * `PromptAssembly.skills`, in link order.
 */
d('skills module (Testcontainers pg)', () => {
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
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient({ diff: DIFF }) },
    });
  }

  const createBody = {
    name: 'No secrets in logs',
    type: 'security' as const,
    source: 'manual' as const,
    body: '# No secrets in logs\n\nNever log API keys or tokens.',
  };

  it('CRUD: create → get → list → update (body bump) → delete → 404s', async () => {
    const app = await makeApp();

    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill.version).toBe(1);
    expect(skill.enabled).toBe(true);
    expect(skill.agents_count).toBe(0);

    const got = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({ name: createBody.name, body: createBody.body });

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === skill.id)).toBe(true);

    // Toggling `enabled` alone does NOT bump the version.
    const toggled = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { enabled: false },
    });
    expect(toggled.statusCode).toBe(200);
    expect(toggled.json().version).toBe(1);
    expect(toggled.json().enabled).toBe(false);

    // A body change DOES bump the version.
    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'Updated body.', change_note: 'tightened wording' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);
    expect(updated.json().body).toBe('Updated body.');

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(404);

    await app.close();
  });

  it('versions: newest-first list, single-version fetch, restore appends a NEW version', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();

    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'v2 body' },
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].body).toBe('v2 body');
    expect(versions[1].body).toBe(createBody.body);

    const v1 = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/1` });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, body: createBody.body });

    expect(
      (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/99` })).statusCode,
    ).toBe(404);

    // Restoring v1 (current body is "v2 body") appends v3 with the old body —
    // history is append-only, v1/v2 stay untouched.
    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    const restoredSkill = restored.json();
    expect(restoredSkill.version).toBe(3);
    expect(restoredSkill.body).toBe(createBody.body);

    const versionsAfterRestore = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versionsAfterRestore.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versionsAfterRestore[0].change_note).toBe('Restored from v1');

    await app.close();
  });

  it('POST /skills/import: plain .md decodes directly (no workspace context required)', async () => {
    const app = await makeApp();
    const body = '# Imported Rubric\n\nBody text.';
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'rubric.md', content_base64: b64(body) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'Imported Rubric', body, warnings: [] });
    await app.close();
  });

  it('POST /skills/import: .zip with a markdown + decoy file warns and extracts only the markdown', async () => {
    const app = await makeApp();
    const mdBody = '# Zipped\n\nBody.';
    const zipped = zipSync({
      'skill.md': strToU8(mdBody),
      'notes.txt': strToU8('decoy'),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'bundle.zip', content_base64: b64(zipped) },
    });
    expect(res.statusCode).toBe(200);
    const parsed = res.json();
    expect(parsed.body).toBe(mdBody);
    expect(parsed.name).toBe('Zipped');
    expect(parsed.warnings).toHaveLength(1);
    await app.close();
  });

  it('POST /skills/import: .zip with no markdown entry → 400', async () => {
    const app = await makeApp();
    const zipped = zipSync({ 'readme.txt': strToU8('no markdown here') });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { filename: 'empty.zip', content_base64: b64(zipped) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe('No markdown file found in archive');
    await app.close();
  });

  it('Agent.skills_count reflects linked skills (GET /agents and GET /agents/:id)', async () => {
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Counted', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const skillA = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();
    const skillB = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'Second skill' },
      })
    ).json();

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skillA.id, skillB.id] },
    });

    const got = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(got.skills_count).toBe(2);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    const listed = list.find((a: { id: string }) => a.id === agent.id);
    expect(listed.skills_count).toBe(2);

    // And from the skill side: Skill.agents_count reflects the same link.
    const skillAAfterLink = (
      await app.inject({ method: 'GET', url: `/skills/${skillA.id}` })
    ).json();
    expect(skillAAfterLink.agents_count).toBe(1);

    await app.close();
  });

  it('POST /agents/:id/skills: overlapping concurrent set-skills calls never 500 with a duplicate-key error', async () => {
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Racy', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const skillA = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();
    const skillB = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...createBody, name: 'B' } })
    ).json();
    const skillC = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...createBody, name: 'C' } })
    ).json();
    const ids = { A: skillA.id, B: skillB.id, C: skillC.id };

    // Seed a populated link set — the bug reproduces on uncheck/re-toggle
    // once several skills are already linked, not from an empty set.
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [ids.A, ids.B, ids.C] },
    });

    // Two overlapping, mostly-overlapping-but-different requests — the
    // "uncheck while a check is still in flight" shape.
    const post = (skillIds: string[]) =>
      app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: skillIds },
      });
    const [r1, r2] = await Promise.all([post([ids.A, ids.B]), post([ids.A, ids.B, ids.C])]);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);

    // Two identical concurrent re-POSTs — the "rapid double-click" shape.
    const [r3, r4] = await Promise.all([post([ids.A]), post([ids.A])]);
    expect(r3.statusCode).toBe(200);
    expect(r4.statusCode).toBe(200);

    const links = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    const linkedIds = links.map((l: { skill_id: string }) => l.skill_id);
    expect(new Set(linkedIds).size).toBe(linkedIds.length);
    expect(linkedIds.every((id: string) => Object.values(ids).includes(id))).toBe(true);

    await app.close();
  });

  async function setupRepoAndPr(db: PgFixture['handle']['db']) {
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `skills-demo-${Date.now()}`, fullName: `acme/skills-demo-${Date.now()}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'PR',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: null,
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

  it('a review run only applies ENABLED linked skills, in link order (PromptAssembly.skills via the run trace)', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();

    const enabledA = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'First (enabled)', body: 'BODY_FIRST_ENABLED' },
      })
    ).json();
    const disabled = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'Disabled skill', body: 'BODY_DISABLED' },
      })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/skills/${disabled.id}`,
      payload: { enabled: false },
    });
    const enabledB = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'Second (enabled)', body: 'BODY_SECOND_ENABLED' },
      })
    ).json();

    // Link order: enabledA, disabled, enabledB — the disabled one sits in the
    // MIDDLE of the order to prove it's filtered by `enabled`, not by position.
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [enabledA.id, disabled.id, enabledB.id] },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.skills).toContain('BODY_FIRST_ENABLED');
    expect(trace.prompt_assembly.skills).toContain('BODY_SECOND_ENABLED');
    expect(trace.prompt_assembly.skills).not.toContain('BODY_DISABLED');
    // Link order preserved: the first-enabled body appears before the second.
    expect(trace.prompt_assembly.skills.indexOf('BODY_FIRST_ENABLED')).toBeLessThan(
      trace.prompt_assembly.skills.indexOf('BODY_SECOND_ENABLED'),
    );

    await app.close();
  });
});
