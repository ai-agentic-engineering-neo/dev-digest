/**
 * Conventions module (server/specs/conventions.md, C1-C10) — extraction with
 * a mock LLM against a real Postgres and a real temp "clone" directory (C3
 * verification reads real file content, so it needs real files on disk).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const SAMPLE_FILE = 'src/index.ts';
const SAMPLE_CONTENT = [
  'export function helloWorld(): string {', // line 1
  "  return 'hello';", // line 2
  '}', // line 3
  '', // line 4
  'export function goodbyeWorld(): string {', // line 5
  "  return 'bye';", // line 6
  '}', // line 7
].join('\n');

function fakeRepoIntel(samplePaths: string[]): RepoIntel {
  return {
    getConventionSamples: async () => samplePaths,
  } as unknown as RepoIntel;
}

d('Conventions module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneDir: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;

    cloneDir = await mkdtemp(join(tmpdir(), 'devdigest-conventions-'));
    await mkdir(join(cloneDir, 'src'), { recursive: true });
    await writeFile(join(cloneDir, SAMPLE_FILE), SAMPLE_CONTENT, 'utf8');
  });
  afterAll(async () => {
    await pg?.stop();
    await rm(cloneDir, { recursive: true, force: true });
  });

  async function insertRepo() {
    const name = `conventions-fixture-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: cloneDir })
      .returning();
    return repo!;
  }

  function appWith(candidates: unknown[]) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ head: 'sha-fixture' }),
        repoIntel: fakeRepoIntel([SAMPLE_FILE]),
        llm: {
          openai: new MockLLMProvider('openai', {
            structuredBySchema: { ConventionExtraction: { candidates } },
          }),
        },
      },
    });
  }

  // ---- C3 evidence verification ---------------------------------------------

  it('extract verifies evidence: keeps an in-range citation, drops an out-of-range one', async () => {
    const repo = await insertRepo();
    const app = await appWith([
      {
        category: 'Naming',
        rule: 'Exported functions use camelCase and a verb-first name.',
        evidence: { path: SAMPLE_FILE, start_line: 1, end_line: 2 },
        confidence: 0.9,
      },
      {
        category: 'Bogus',
        rule: 'A rule citing a line that does not exist.',
        evidence: { path: SAMPLE_FILE, start_line: 100, end_line: 105 },
        confidence: 0.5,
      },
    ]);

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dropped).toBe(1);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({
      rule: 'Exported functions use camelCase and a verb-first name.',
      evidence_path: SAMPLE_FILE,
      evidence_start_line: 1,
      evidence_end_line: 2,
      status: 'pending',
    });
    // C3: the stored snippet is read from the clone, never the model's own text.
    expect(body.candidates[0].evidence_snippet).toBe(
      "export function helloWorld(): string {\n  return 'hello';",
    );
    expect(body.scan).toMatchObject({ status: 'ok', sha: 'sha-fixture', candidates_dropped: 1 });
    await app.close();
  });

  // ---- C6 re-scan semantics --------------------------------------------------

  it('re-scan replaces pending candidates, keeps a rejected one hidden, and never re-adds its normalized rule', async () => {
    const repo = await insertRepo();
    const ruleA = 'Exported functions use camelCase.';

    const app1 = await appWith([
      {
        category: 'Naming',
        rule: ruleA,
        evidence: { path: SAMPLE_FILE, start_line: 1, end_line: 2 },
        confidence: 0.9,
      },
    ]);
    const first = await app1.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/extract`,
    });
    const candidateId = first.json().candidates[0].id as string;
    await app1.inject({ method: 'PATCH', url: `/conventions/${candidateId}`, payload: { status: 'rejected' } });
    await app1.close();

    // Re-scan: same rule (different casing/punctuation — normalizes the same)
    // PLUS a genuinely new one.
    const app2 = await appWith([
      {
        category: 'Naming',
        rule: 'Exported functions use CamelCase!!',
        evidence: { path: SAMPLE_FILE, start_line: 1, end_line: 2 },
        confidence: 0.9,
      },
      {
        category: 'Error handling',
        rule: 'Never swallow a caught error silently.',
        evidence: { path: SAMPLE_FILE, start_line: 5, end_line: 6 },
        confidence: 0.7,
      },
    ]);
    const second = await app2.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/extract`,
    });
    expect(second.statusCode).toBe(200);
    const rules = second.json().candidates.map((c: { rule: string }) => c.rule);
    expect(rules).toEqual(['Never swallow a caught error silently.']);

    const list = await app2.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
    const listedRules = list.json().candidates.map((c: { rule: string; status: string }) => c.rule);
    expect(listedRules).not.toContain(ruleA);
    expect(listedRules).not.toContain('Exported functions use CamelCase!!');
    await app2.close();
  });

  // ---- C7/C8 skill from accepted candidates only -----------------------------

  it('creates a skill only from accepted candidates, with evidence_files and source=extracted', async () => {
    const repo = await insertRepo();
    const app = await appWith([
      {
        category: 'Naming',
        rule: 'Exported functions use camelCase.',
        evidence: { path: SAMPLE_FILE, start_line: 1, end_line: 2 },
        confidence: 0.9,
      },
      {
        category: 'Error handling',
        rule: 'Never swallow a caught error silently.',
        evidence: { path: SAMPLE_FILE, start_line: 5, end_line: 6 },
        confidence: 0.7,
      },
    ]);
    const extracted = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/extract`,
    });
    const [accept, leavePending] = extracted.json().candidates as { id: string }[];
    await app.inject({
      method: 'PATCH',
      url: `/conventions/${accept!.id}`,
      payload: { status: 'accepted' },
    });
    void leavePending;

    const preview = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill/preview`,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ name: 'repo-conventions', accepted_count: 1, name_taken_by: null });
    expect(preview.json().body).toContain('Exported functions use camelCase.');
    expect(preview.json().body).not.toContain('Never swallow a caught error silently.');

    const created = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/skill`,
      payload: {
        name: 'repo-conventions',
        description: preview.json().description,
        type: 'convention',
        enabled: true,
        body: preview.json().body,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: 'repo-conventions',
      source: 'extracted',
      type: 'convention',
      version: 1,
      evidence_files: [SAMPLE_FILE],
    });

    const skillGet = await app.inject({ method: 'GET', url: `/skills/${created.json().id}` });
    expect(skillGet.statusCode).toBe(200);
    await app.close();
  });

  // ---- C9 tenancy -------------------------------------------------------------

  it('a repo from another workspace is invisible: extract/get return 404', async () => {
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-conventions' }).returning();
    const [foreignRepo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: otherWs!.id,
        owner: 'acme',
        name: 'foreign-conventions',
        fullName: 'acme/foreign-conventions',
        clonePath: cloneDir,
      })
      .returning();

    const app = await appWith([]);
    const extract = await app.inject({
      method: 'POST',
      url: `/repos/${foreignRepo!.id}/conventions/extract`,
    });
    expect(extract.statusCode).toBe(404);
    const get = await app.inject({ method: 'GET', url: `/repos/${foreignRepo!.id}/conventions` });
    expect(get.statusCode).toBe(404);
    await app.close();
  });

  // ---- C10 readiness -----------------------------------------------------------

  it('a repo with no clone_path returns 409 before any LLM call', async () => {
    const name = `conventions-not-cloned-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();

    const app = await appWith([]);
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repo!.id}/conventions/extract`,
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});
