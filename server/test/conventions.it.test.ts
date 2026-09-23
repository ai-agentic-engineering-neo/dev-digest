import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// Sampling reads CONFIG_SAMPLE_PATHS via git.readFile — repo-intel returns no
// ranked files for a repo that was never indexed, so the grounded candidate
// below must cite one of the config paths (package.json), not an arbitrary
// source file the sampler never actually reads.
const PACKAGE_JSON = ['{', '  "name": "acme-app",', '  "type": "module"', '}'].join('\n');

/** A structured-extraction fixture: one candidate really grounded in package.json,
 *  one candidate that cites a file we never sampled (dropped: unknown_file). */
function extractionFixture(overrides: { rule?: string } = {}) {
  return {
    candidates: [
      {
        rule: overrides.rule ?? 'Packages declare themselves as ES modules',
        rationale: 'Keeps import syntax consistent across the codebase.',
        evidence_path: 'package.json',
        evidence_line: 3,
        evidence_snippet: '"type": "module"',
        category: 'structure',
        occurrences: 2,
        confidence: 0.82,
      },
      {
        rule: 'Invented rule with no real evidence',
        rationale: 'Made up.',
        evidence_path: 'src/never-sampled.ts',
        evidence_line: 1,
        evidence_snippet: 'this file was never in the sample',
        category: 'general',
        occurrences: 1,
        confidence: 0.6,
      },
    ],
  };
}

/**
 * L02 — Conventions Extractor module: the full SAMPLE → PROPOSE → VERIFY →
 * triage → skill-draft flow, run against a real (Testcontainers) Postgres.
 */
d('conventions module (Testcontainers pg)', () => {
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

  async function makeRepo(suffix: string) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `conventions-demo-${suffix}`,
        fullName: `acme/conventions-demo-${suffix}`,
      })
      .returning();
    return repo!;
  }

  function makeApp(fixture: unknown = extractionFixture()) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: { 'package.json': PACKAGE_JSON } }),
        llm: { openai: new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: fixture } }) },
      },
    });
  }

  it('extract: drops the ungrounded candidate, persists the verified one as pending', async () => {
    const app = await makeApp();
    const repo = await makeRepo('extract');

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const result = res.json();

    expect(result.proposed).toBe(2);
    expect(result.dropped_ungrounded).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      rule: 'Packages declare themselves as ES modules',
      status: 'pending',
      evidence_path: 'package.json',
      evidence_line: 3,
    });
    // The evidence shown is re-read from the real file, not the model's text.
    expect(result.candidates[0].evidence_snippet).toContain('"type": "module"');

    const list = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
    expect(list.json()).toHaveLength(1);

    await app.close();
  });

  it('re-scan preserves accepted/rejected decisions and does not re-propose them', async () => {
    const app = await makeApp();
    const repo = await makeRepo('rescan');

    const first = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    const candidate = first.json().candidates[0];

    const accepted = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidate.id}`,
      payload: { status: 'accepted' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe('accepted');

    // Re-scan proposes the SAME rule again (same fixture) — it must be dropped
    // as a duplicate of an already-decided rule, and the accepted row survives.
    const second = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    const secondResult = second.json();
    expect(secondResult.dropped_duplicate).toBe(1);
    expect(secondResult.candidates).toHaveLength(1);
    expect(secondResult.candidates[0]).toMatchObject({ id: candidate.id, status: 'accepted' });

    await app.close();
  });

  it('PATCH edits the rule/rationale and rejects; DELETE removes a candidate', async () => {
    const app = await makeApp();
    const repo = await makeRepo('edit');
    const scan = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    const candidate = scan.json().candidates[0];

    const edited = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidate.id}`,
      payload: { rule: 'Edited rule text', rationale: null },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ rule: 'Edited rule text', rationale: null, status: 'pending' });

    const rejected = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidate.id}`,
      payload: { status: 'rejected' },
    });
    expect(rejected.json().status).toBe('rejected');

    const del = await app.inject({ method: 'DELETE', url: `/conventions/${candidate.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'DELETE', url: `/conventions/${candidate.id}` })).statusCode).toBe(404);

    await app.close();
  });

  it('skill draft: 422 with nothing accepted; drafts the accepted rows and persists NOTHING until POST /skills', async () => {
    const app = await makeApp();
    const repo = await makeRepo('draft');
    const scan = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    const candidate = scan.json().candidates[0];

    // The real client (`useConventionSkillDraft`) always posts a body — an
    // empty `{}` at minimum, never an omitted one — so tests do the same;
    // zod's `.default({})` only kicks in for an `undefined` body, not the
    // `null` Fastify passes for a truly bodyless request.
    const tooEarly = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill`, payload: {} });
    expect(tooEarly.statusCode).toBe(422);

    await app.inject({ method: 'PATCH', url: `/conventions/${candidate.id}`, payload: { status: 'accepted' } });

    const draftRes = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/skill`, payload: {} });
    expect(draftRes.statusCode).toBe(200);
    const draft = draftRes.json();
    expect(draft.type).toBe('convention');
    expect(draft.convention_ids).toEqual([candidate.id]);
    expect(draft.body).toContain('Packages declare themselves as ES modules');

    // Nothing was written by the draft call — no skill with this name exists
    // yet (the workspace already has seeded built-in skills, so the list
    // itself is never empty).
    const beforeCreate = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(beforeCreate.some((sk: { name: string }) => sk.name === draft.name)).toBe(false);

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: draft.name, description: draft.description, type: draft.type, body: draft.body, source: 'extracted' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().source).toBe('extracted');

    await app.close();
  });

  it('extract: 422 when the repo has nothing readable to sample', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: {} }),
        llm: { openai: new MockLLMProvider('openai') },
      },
    });
    const repo = await makeRepo('empty');

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(422);

    await app.close();
  });
});
