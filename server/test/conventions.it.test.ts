import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * The conventions module end to end: a scan that samples in code and calls the
 * model ONCE, a verifier that refuses evidence the clone does not back, the
 * decisions a user makes surviving a re-scan, and the skill the accepted rules
 * become — linked to an agent and rendered into its prompt.
 */
d('conventions module', () => {
  let pg: PgFixture;
  let clonePath: string;

  /** The file the model will cite. Line 3 is the one the fixture quotes. */
  const SOURCE = [
    'import { z } from "zod";',
    '',
    'export const ListQuery = z.object({ status: z.string().optional() });',
    '',
    'export async function list(id: string) {',
    '  return db.select().from(pulls);',
    '}',
  ].join('\n');

  const EXTRACTION = {
    candidates: [
      {
        category: 'api',
        rule: 'Query parameters are declared with a Zod schema beside the route.',
        rationale: 'Every route in the sample declares its query shape this way.',
        evidence: [
          {
            path: 'src/routes.ts',
            line_start: 3,
            line_end: 3,
            snippet: 'export const ListQuery = z.object({ status: z.string().optional() });',
          },
        ],
        confidence: 0.92,
      },
      {
        category: 'async',
        rule: 'Handlers are async and return the query directly.',
        evidence: [
          {
            path: 'src/routes.ts',
            line_start: 5,
            line_end: 6,
            snippet: 'export async function list(id: string) {',
          },
        ],
        confidence: 0.71,
      },
      {
        // Cites a file the sampler never showed the model: must be discarded.
        category: 'naming',
        rule: 'Everything is named beautifully.',
        evidence: [
          { path: 'src/imaginary.ts', line_start: 1, line_end: 2, snippet: 'const nope = 1;' },
        ],
        confidence: 0.99,
      },
    ],
  };

  /** The two facade reads a scan makes: the sample ranking and the whole-index counts. */
  const repoIntel = {
    getConventionSamples: async () => ['src/routes.ts'],
    getConventionFacts: async () => ({
      filesIndexed: 42,
      edgesIndexed: 17,
      strataDepth: 1,
      strata: ['src'],
      recurringFileNames: [{ name: 'routes.ts', count: 6 }],
      naming: [],
      tests: [],
      exportKinds: [],
      siblingImports: [{ from: 'routes.ts', to: 'service.ts', imports: 5 }],
      directoryImports: [],
    }),
  } as unknown as RepoIntel;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    clonePath = await mkdtemp(join(tmpdir(), 'devdigest-conv-it-'));
    await mkdir(join(clonePath, 'src'), { recursive: true });
    await writeFile(join(clonePath, 'package.json'), '{ "name": "payments-api" }\n');
    await writeFile(join(clonePath, 'src', 'routes.ts'), SOURCE);
  });

  afterAll(async () => {
    await rm(clonePath, { recursive: true, force: true });
    await pg?.stop();
  });

  let llm: MockLLMProvider;

  function makeApp(extraction: unknown = EXTRACTION) {
    llm = new MockLLMProvider('openai', {
      structuredBySchema: { ConventionExtraction: extraction },
    });
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ head: 'feedfacecafe' }),
        github: new MockGitHubClient(),
        repoIntel,
        llm: { openai: llm, anthropic: llm, openrouter: llm },
      },
    });
  }

  let repoSeq = 0;

  /** A fresh repo per scenario so one test's decisions never leak into another. */
  async function makeRepo(): Promise<string> {
    const [ws] = await pg.handle.db.select().from(t.workspaces).limit(1);
    const n = repoSeq++;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: ws!.id,
        owner: 'acme',
        name: `payments-${n}`,
        fullName: `acme/payments-${n}`,
        clonePath,
      })
      .returning();
    return repo!.id;
  }

  /** Run the scan and wait for the job to finish. */
  async function scan(app: Awaited<ReturnType<typeof makeApp>>, repoId: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(202);
    await app.container.jobs.onIdle();
    return res.json() as { scan_id: string };
  }

  async function page(app: Awaited<ReturnType<typeof makeApp>>, repoId: string) {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  it('scans a repo with ONE model call and stores only verified candidates', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await scan(app, repoId);

    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls).toHaveLength(1);

    const { scan: scanDto, candidates } = await page(app, repoId);
    expect(scanDto.status).toBe('done');
    expect(scanDto.candidates_total).toBe(3);
    expect(scanDto.candidates_kept).toBe(2);
    // The rule citing a file outside the sample is gone, and the tally says why.
    expect(scanDto.discarded.missing_file).toBe(1);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c: { rule: string }) => c.rule)).not.toContain(
      'Everything is named beautifully.',
    );
  });

  it('samples the repo in code: the model sees configs and ranked files, nothing else', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await scan(app, repoId);

    const { scan: scanDto } = await page(app, repoId);
    expect(scanDto.sample_files).toContain('package.json');
    expect(scanDto.sample_files).toContain('src/routes.ts');

    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const req = call.req as { messages: { role: string; content: string }[]; model: string };
    const user = req.messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('## Declared tooling');
    expect(user).toContain('3 | export const ListQuery');
    expect(user).toContain('<untrusted source="repo">');
  });

  it('gives the model whole-index counts alongside the samples', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await scan(app, repoId);

    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const req = call.req as { messages: { role: string; content: string }[] };
    const user = req.messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('## Measured facts');
    expect(user).toContain('42 files, 17 import edges');
    expect(user).toContain('routes.ts → service.ts ×5');
  });

  it('closes a scan left running by a dead process, so the repo can be scanned again', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    const [ws] = await pg.handle.db.select().from(t.workspaces).limit(1);
    // What a restart mid-scan leaves behind: a `running` row nobody will finish,
    // which the one-running-scan index would otherwise hold for ever.
    await pg.handle.db.insert(t.conventionScans).values({
      workspaceId: ws!.id,
      repoId,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      status: 'running',
      startedAt: new Date(Date.now() - 20 * 60_000),
    });

    const before = await page(app, repoId);
    expect(before.scan.status).toBe('failed');
    expect(before.scan.error).toContain('abandoned');

    await scan(app, repoId);
    const after = await page(app, repoId);
    expect(after.scan.status).toBe('done');
  });

  it('refuses a second scan while one is genuinely running', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    const [ws] = await pg.handle.db.select().from(t.workspaces).limit(1);
    await pg.handle.db.insert(t.conventionScans).values({
      workspaceId: ws!.id,
      repoId,
      provider: 'openai',
      model: 'gpt-4.1-mini',
      status: 'running',
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('already running');
  });

  it('records the evidence snippet from the file and pins it to the scanned commit', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await scan(app, repoId);

    const { candidates } = await page(app, repoId);
    const api = candidates.find((c: { category: string }) => c.category === 'api');
    expect(api.evidence_path).toBe('src/routes.ts');
    expect(api.evidence_line_start).toBe(3);
    expect(api.evidence_snippet).toContain('export const ListQuery');
    expect(api.evidence_sha).toBe('feedfacecafe');
  });

  it('keeps the model\'s rationale, so the card can say how widespread the rule is', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await scan(app, repoId);

    const { candidates } = await page(app, repoId);
    const api = candidates.find((c: { category: string }) => c.category === 'api');
    expect(api.rationale).toBe('Every route in the sample declares its query shape this way.');
    // The fixture's second candidate carries none: absent stays absent, not "".
    const async = candidates.find((c: { category: string }) => c.category === 'async');
    expect(async.rationale ?? null).toBeNull();
  });

  it('takes the model from Settings → Models instead of a constant', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();

    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { conventions: { provider: 'openai', model: 'gpt-4.1-mini' } } },
    });
    expect(put.statusCode).toBe(200);

    await scan(app, repoId);
    const { scan: scanDto } = await page(app, repoId);
    expect(scanDto).toMatchObject({ provider: 'openai', model: 'gpt-4.1-mini' });

    // Put the workspace back, so the sibling tests see the registry default.
    await app.inject({ method: 'PUT', url: '/settings', payload: { feature_models: {} } });
  });

  it('keeps a rejected candidate out of a re-scan and out of the skill', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await scan(app, repoId);

    const before = await page(app, repoId);
    const doomed = before.candidates[0];
    const reject = await app.inject({
      method: 'PATCH',
      url: `/conventions/${doomed.id}`,
      payload: { status: 'rejected' },
    });
    expect(reject.statusCode).toBe(200);

    await scan(app, repoId);
    const after = await page(app, repoId);

    // Still exactly one row for that rule, still rejected — not resurrected as
    // a fresh `pending` copy by the second scan.
    const sameRule = after.candidates.filter(
      (c: { rule: string }) => c.rule === doomed.rule,
    );
    expect(sameRule).toHaveLength(1);
    expect(sameRule[0].status).toBe('rejected');
    expect(after.scan.discarded.rejected_before).toBe(1);
  });

  it('tells the model what was already decided, so a re-scan looks for new rules', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await scan(app, repoId);

    const first = await page(app, repoId);
    await app.inject({
      method: 'PATCH',
      url: `/conventions/${first.candidates[0].id}`,
      payload: { status: 'accepted' },
    });

    await scan(app, repoId);
    const call = llm.calls.filter((c) => c.method === 'completeStructured').at(-1)!;
    const req = call.req as { messages: { role: string; content: string }[] };
    const user = req.messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('## Already decided');
    expect(user).toContain(first.candidates[0].rule);
  });

  it('edits a rule inline without touching its evidence', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await scan(app, repoId);

    const { candidates } = await page(app, repoId);
    const target = candidates[0];
    const res = await app.inject({
      method: 'PATCH',
      url: `/conventions/${target.id}`,
      payload: { rule: 'Route query shapes are Zod schemas.', category: 'types' },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json();
    expect(updated.rule).toBe('Route query shapes are Zod schemas.');
    expect(updated.category).toBe('types');
    expect(updated.evidence_path).toBe(target.evidence_path);
    expect(updated.evidence_snippet).toBe(target.evidence_snippet);
  });

  it('refuses to build a skill from a candidate that is not accepted', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await scan(app, repoId);
    const { candidates } = await page(app, repoId);

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill/preview`,
      payload: { candidate_ids: [candidates[0].id] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('not accepted');
  });

  it('previews a skill body without writing anything', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await scan(app, repoId);
    const { candidates } = await page(app, repoId);
    await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidates[0].id}`,
      payload: { status: 'accepted' },
    });

    const before = await pg.handle.db.select().from(t.skills);
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill/preview`,
      payload: { candidate_ids: [candidates[0].id] },
    });
    expect(res.statusCode).toBe(200);
    const preview = res.json();
    expect(preview.name).toBe('repo-conventions');
    expect(preview.body).toContain(candidates[0].rule);
    expect(preview.body).toContain('src/routes.ts:3');

    const after = await pg.handle.db.select().from(t.skills);
    expect(after).toHaveLength(before.length);
  });

  // That a linked, enabled skill becomes a prompt block is proven once, for
  // every skill, in reviews-skills.it.test.ts; this test proves the link.
  it('creates the skill from accepted rules and links it to an agent', async () => {
    const app = await makeApp();
    const repoId = await makeRepo();
    await scan(app, repoId);
    const { candidates } = await page(app, repoId);
    for (const c of candidates) {
      await app.inject({ method: 'PATCH', url: `/conventions/${c.id}`, payload: { status: 'accepted' } });
    }

    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json();
    const agent = agents[0];

    const preview = (
      await app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill/preview`,
        payload: { candidate_ids: candidates.map((c: { id: string }) => c.id) },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: {
        candidate_ids: candidates.map((c: { id: string }) => c.id),
        name: 'repo-conventions',
        description: preview.description,
        type: 'convention',
        body: `${preview.body}\n\n<!-- edited before saving -->`,
        enabled: true,
        agent_id: agent.id,
      },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({ name: 'repo-conventions', source: 'extracted', enabled: true });
    // What the user confirmed is what got stored — not a re-render of the preview.
    expect(skill.body).toContain('<!-- edited before saving -->');
    expect(skill.evidence_files).toContain('src/routes.ts');

    // Visible on the Skills screen, and the candidates now point at it.
    const all = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(all.map((s: { id: string }) => s.id)).toContain(skill.id);
    const stamped = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repoId));
    expect(stamped.every((row) => row.skillId === skill.id)).toBe(true);

    // Linked to the agent, in the prompt order the editor shows.
    const links = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(links.map((l: { skill_id: string }) => l.skill_id)).toContain(skill.id);
  });

  it('fails a scan with a reason when the repo has no ranking to sample', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        repoIntel: { getConventionSamples: async () => [] } as unknown as RepoIntel,
        llm: {
          openai: new MockLLMProvider('openai', {
            structuredBySchema: { ConventionExtraction: EXTRACTION },
          }),
        },
      },
    });
    const repoId = await makeRepo();
    await scan(app, repoId);

    const { scan: scanDto, candidates } = await page(app, repoId);
    expect(scanDto.status).toBe('failed');
    expect(scanDto.error).toContain('repo_not_indexed');
    expect(candidates).toEqual([]);
  });
});
