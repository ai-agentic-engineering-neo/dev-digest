import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  ConventionCandidate,
  ConventionScanResult,
  ConventionsPage,
  ConventionSkillDraft,
  ConventionSkillResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const USERS = [
  "import { db } from '../db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  return user;',
  '}',
].join('\n');

const ORDERS = [
  'export async function getOrder(id: string) {',
  '  const order = await db.orders.find(id);',
  '  return order;',
  '}',
].join('\n');

const FILES = {
  'package.json': '{ "name": "payments-api", "type": "module" }',
  'src/api/users.ts': USERS,
  'src/api/orders.ts': ORDERS,
};

const ASYNC_RULE = {
  rule: 'Use async/await instead of .then() chains',
  evidence: [{ path: 'src/api/users.ts', line: 4, snippet: 'const user = await db.users.find(id);' }],
  occurrences: 2,
  bad_example: 'db.users.find(id).then((u) => u);',
  category: 'general',
  confidence: 0.85,
};
const ASYNC_DUP = {
  ...ASYNC_RULE,
  rule: 'use async/await instead of .then() chains.',
  evidence: [{ path: 'src/api/orders.ts', line: 9, snippet: 'const order = await db.orders.find(id);' }],
  confidence: 0.9,
};
const NAMING_RULE = {
  rule: 'Name data loaders get<Entity>',
  evidence: [{ path: 'src/api/orders.ts', line: 1, snippet: 'export async function getOrder(id: string) {' }],
  occurrences: 2,
  bad_example: 'export async function fetchOrderData(id: string) {}',
  category: 'naming',
  confidence: 0.7,
};
const INVENTED = {
  ...NAMING_RULE,
  rule: 'Wrap handlers in tryCatch()',
  evidence: [{ path: 'src/api/users.ts', line: 2, snippet: 'return tryCatch(async () => handler());' }],
};
const LOW = { ...NAMING_RULE, rule: 'Maybe use tabs', confidence: 0.2 };

/**
 * Conventions Extractor over a real Postgres: scan (sample → mock model →
 * evidence gate → replace pending), triage, the skill draft, creating an
 * extracted skill and that it reaches the prompt only once enabled.
 */
d('conventions module', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  let repoId: string;
  let samples: string[] = ['src/api/users.ts', 'src/api/orders.ts'];
  // Mutable fixture: MockLLMProvider keeps this object by reference.
  const bySchema: Record<string, unknown> = {
    ConventionExtraction: { candidates: [ASYNC_RULE, ASYNC_DUP, NAMING_RULE, INVENTED, LOW] },
  };
  const llm = new MockLLMProvider('openai', { structuredBySchema: bySchema });

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
    repoId = repo!.id;
    const repoIntel = {
      getConventionSamples: async () => samples,
    } as unknown as RepoIntel;
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES, head: 'abc1234' }),
        github: new MockGitHubClient(),
        llm: { openai: llm },
        repoIntel,
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const db = () => pg.handle.db;
  const setClone = (path: string | null) =>
    db().update(t.repos).set({ clonePath: path }).where(eq(t.repos.id, repoId));

  async function getPage(): Promise<ConventionsPage> {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  async function scan(): Promise<ConventionScanResult> {
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  async function patch(id: string, payload: Record<string, unknown>) {
    return app.inject({ method: 'PATCH', url: `/conventions/${id}`, payload });
  }

  const byRule = (page: { candidates: ConventionCandidate[] }, rule: string) =>
    page.candidates.find((c) => c.rule === rule)!;

  it('lists nothing and no scan before the first scan', async () => {
    expect(await getPage()).toEqual({ scan: null, candidates: [] });
  });

  it('422s when the repo is not cloned, then when it is not indexed', async () => {
    await setClone(null);
    const notCloned = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    expect(notCloned.statusCode).toBe(422);
    expect(notCloned.json().message ?? notCloned.body).toMatch(/not cloned/i);

    await setClone('/clones/acme/payments-api');
    samples = [];
    const notIndexed = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    expect(notIndexed.statusCode).toBe(422);
    expect(notIndexed.body).toMatch(/not indexed/i);
    samples = ['src/api/users.ts', 'src/api/orders.ts'];
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);
  });

  it('a FIRST scan that keeps nothing still answers with this scan\'s meta', async () => {
    bySchema.ConventionExtraction = { candidates: [] };
    const res = await scan();
    expect(res).toMatchObject({ proposed: 0, kept: 0, candidates: [] });
    expect(res.scan).toMatchObject({ commit_sha: 'abc1234', files_sampled: 3 });
    // Nothing was stored to carry the meta — a reload shows "never scanned" (accepted trade-off).
    expect((await getPage()).scan).toBeNull();
    bySchema.ConventionExtraction = { candidates: [ASYNC_RULE, ASYNC_DUP, NAMING_RULE, INVENTED, LOW] };
  });

  it('scans: gate drops invented + low-confidence, duplicates merge into one rule', async () => {
    const res = await scan();
    expect(res).toMatchObject({ proposed: 5, kept: 2, dropped_ungrounded: 2, dropped_duplicate: 1 });
    expect(res.scan).toMatchObject({ commit_sha: 'abc1234', files_sampled: 3, model: 'gpt-5.4' });

    const asyncRule = byRule(res, ASYNC_RULE.rule);
    expect(asyncRule).toMatchObject({
      status: 'pending',
      accepted: false,
      category: 'general',
      confidence: 0.9,
      evidence_path: 'src/api/users.ts',
      evidence_snippet: 'const user = await db.users.find(id);',
      skill_names: [],
    });
    // The duplicate's evidence was merged and its wrong line (9) corrected to 2.
    expect(asyncRule.evidence).toEqual([
      { path: 'src/api/users.ts', line_start: 4, line_end: 4, snippet: 'const user = await db.users.find(id);' },
      { path: 'src/api/orders.ts', line_start: 2, line_end: 2, snippet: 'const order = await db.orders.find(id);' },
    ]);

    expect(asyncRule.commit_sha).toBe('abc1234');

    // The prompt shows only sampled files, line-numbered, as untrusted data with a guard.
    const call = llm.calls.at(-1)!.req as { messages: { content: string }[] };
    expect(call.messages[1]!.content).toContain('<untrusted source="repo-sample">\n--- FILE: package.json ---');
    expect(call.messages[1]!.content).toContain('--- FILE: src/api/users.ts ---\n1\timport');
    expect(call.messages[0]!.content).toContain('SECURITY — read carefully');
  });

  it('accept / reject / edit, and a re-scan replaces only pending rows', async () => {
    const page = await getPage();
    const asyncRule = byRule(page, ASYNC_RULE.rule);
    const naming = byRule(page, NAMING_RULE.rule);

    const rejected = await patch(naming.id, { status: 'rejected' });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toMatchObject({ status: 'rejected', accepted: false });

    const edited = await patch(asyncRule.id, {
      status: 'accepted',
      rule: 'Always use async/await',
      category: 'errors',
      bad_example: 'x.then(y)',
      remove_evidence_index: 1,
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({
      status: 'accepted',
      accepted: true,
      rule: 'Always use async/await',
      category: 'errors',
      bad_example: 'x.then(y)',
    });
    expect(edited.json().evidence).toHaveLength(1);

    const last = await patch(asyncRule.id, { remove_evidence_index: 0 });
    expect(last.statusCode).toBe(400);
    expect((await patch(asyncRule.id, {})).statusCode).toBe(422);

    // A rejected rule switched back to accepted, then back to rejected.
    expect((await patch(naming.id, { status: 'accepted' })).json().status).toBe('accepted');
    expect((await patch(naming.id, { status: 'rejected' })).json().status).toBe('rejected');

    // Re-scan with the same proposals: both rules are decided → nothing new.
    bySchema.ConventionExtraction = { candidates: [NAMING_RULE, { ...ASYNC_RULE, rule: 'Always use async/await' }] };
    const rescan = await scan();
    expect(rescan).toMatchObject({ proposed: 2, kept: 0, dropped_duplicate: 2 });
    expect(rescan.candidates.map((c) => c.status).sort()).toEqual(['accepted', 'rejected']);
  });

  it('a scan that keeps nothing returns the counters, its own meta, and keeps decided rows', async () => {
    const before = (await getPage()).scan!;
    bySchema.ConventionExtraction = { candidates: [] };
    const res = await scan();
    expect(res).toMatchObject({ proposed: 0, kept: 0, dropped_ungrounded: 0, dropped_duplicate: 0 });
    expect(res.candidates).toHaveLength(2);
    expect(res.scan!.at > before.at).toBe(true);
  });

  it('drafts a skill from accepted conventions only', async () => {
    const page = await getPage();
    const accepted = page.candidates.find((c) => c.status === 'accepted')!;
    const rejected = page.candidates.find((c) => c.status === 'rejected')!;

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill-draft`,
      payload: { convention_ids: [accepted.id] },
    });
    expect(res.statusCode).toBe(200);
    const draft = res.json() as ConventionSkillDraft;
    expect(draft.name).toBe('payments-api-errors-conventions');
    expect(draft.description).toBe('1 house convention extracted from acme/payments-api');
    expect(draft.body).toContain('## Error handling');
    expect(draft.body).toContain('✅ `src/api/users.ts:4`');
    expect(draft.body).toContain('x.then(y)');
    expect(draft.tokens).toBeGreaterThan(0);
    expect(await db().select().from(t.skills).where(eq(t.skills.name, draft.name))).toHaveLength(0);

    const notAccepted = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill-draft`,
      payload: { convention_ids: [rejected.id] },
    });
    expect(notAccepted.statusCode).toBe(400);
  });

  it('creates an extracted, disabled skill; 409 on a taken name; badge on the card', async () => {
    const page = await getPage();
    const accepted = page.candidates.find((c) => c.status === 'accepted')!;
    const payload = {
      convention_ids: [accepted.id],
      name: 'payments-api-conventions',
      description: 'From the repo',
    };
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload });
    expect(res.statusCode).toBe(201);
    const { skill } = res.json() as ConventionSkillResult;
    expect(skill).toMatchObject({
      name: 'payments-api-conventions',
      type: 'convention',
      source: 'extracted',
      enabled: false,
      version: 1,
      evidence_files: ['src/api/users.ts'],
    });
    expect(skill.body.startsWith('# payments-api-conventions')).toBe(true);

    const dup = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload });
    expect(dup.statusCode).toBe(409);

    expect(byRule(await getPage(), accepted.rule).skill_names).toEqual(['payments-api-conventions']);

    // Linked to an agent, it reaches the prompt only once enabled.
    const [agent] = await db()
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'General Reviewer')));
    const link = await app.inject({
      method: 'POST',
      url: `/agents/${agent!.id}/skills`,
      payload: { skill_id: skill.id },
    });
    expect(link.statusCode).toBe(200);
    const prompt = new ReviewRepository(db());
    expect((await prompt.loadPromptSkills(agent!.id)).map((s) => s.name)).not.toContain(skill.name);
    const enable = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: true } });
    expect(enable.statusCode).toBe(200);
    expect((await prompt.loadPromptSkills(agent!.id)).map((s) => s.name)).toContain(skill.name);
  });

  it('is workspace-scoped: foreign repo and foreign convention are 404', async () => {
    const [ws] = await db().insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'x', name: 'y', fullName: 'x/y' })
      .returning();
    const [conv] = await db()
      .insert(t.conventions)
      .values({ workspaceId: ws!.id, repoId: repo!.id, rule: 'foreign', confidence: 0.9 })
      .returning();

    expect((await app.inject({ method: 'GET', url: `/repos/${repo!.id}/conventions` })).statusCode).toBe(404);
    expect((await patch(conv!.id, { status: 'accepted' })).statusCode).toBe(404);
    const create = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { convention_ids: [conv!.id], name: 'stolen' },
    });
    expect(create.statusCode).toBe(404);
  });

  it('reads a legacy row without details', async () => {
    await db()
      .insert(t.conventions)
      .values({ workspaceId, repoId, rule: 'Legacy rule', evidencePath: 'a.ts', evidenceSnippet: 'x', confidence: 0.6 });
    const legacy = byRule(await getPage(), 'Legacy rule');
    expect(legacy).toMatchObject({ status: 'pending', category: 'general', evidence: [], evidence_path: 'a.ts' });

    // Editing it must not wipe its only evidence (the flat columns).
    const edited = await patch(legacy.id, { category: 'naming' });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ category: 'naming', evidence_path: 'a.ts', evidence_snippet: 'x' });
  });
});
