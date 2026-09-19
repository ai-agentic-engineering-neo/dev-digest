import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed, DEFAULT_PROVIDER, DEFAULT_MODEL } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills-seed] Docker not available — skipping integration tests.');
}

const CATALOG_NAMES = [
  'pr-quality-rubric',
  'no-then-chains',
  'secret-leakage-gate',
  'lethal-trifecta',
  'phantom-api-gate',
  'test-coverage-nudge',
] as const;

const FIXTURE_MD = new URL('../../docs/skill-fixtures/flaky-tests/SKILL.md', import.meta.url);
const DEPRECATION_MD = new URL('../../docs/skill-fixtures/deprecation-policy/SKILL.md', import.meta.url);

d('skills catalog seed', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  it('is idempotent: unique catalog names, one Test Quality, one API Contract Reviewer', async () => {
    const app = await makeApp();
    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json() as { name: string }[];
    const names = skills.map((s) => s.name);
    for (const name of CATALOG_NAMES) {
      expect(names.filter((n) => n === name)).toHaveLength(1);
    }
    expect(names).toContain('uncovered-branches');
    expect(names).toContain('corner-cases');
    expect(names).toContain('excessive-mocking');
    expect(names).toContain('breaking-change');
    expect(names).toContain('response-schema');
    expect(names).toContain('semver-discipline');
    expect(names).not.toContain('flaky-tests');
    expect(names).not.toContain('deprecation-policy');
    expect(names.filter((n) => n === 'breaking-change')).toHaveLength(1);
    expect(names.filter((n) => n === 'response-schema')).toHaveLength(1);
    expect(names.filter((n) => n === 'semver-discipline')).toHaveLength(1);

    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as {
      name: string;
      provider: string;
      model: string;
      ci_fail_on: string;
    }[];
    expect(agents.filter((a) => a.name === 'Test Quality Reviewer')).toHaveLength(1);
    const api = agents.filter((a) => a.name === 'API Contract Reviewer');
    expect(api).toHaveLength(1);
    expect(api[0]!.ci_fail_on).toBe('critical');
    expect(api[0]!.provider).toBe(DEFAULT_PROVIDER);
    expect(api[0]!.model).toBe(DEFAULT_MODEL);
    await app.close();
  });

  it('seeds the Security / Performance / General / Test Quality / API Contract link matrix', async () => {
    const app = await makeApp();
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as {
      id: string;
      name: string;
    }[];
    const idOf = (name: string) => agents.find((a) => a.name === name)!.id;

    type Link = { name: string; enabled: boolean; skill_id: string; description: string; type: string };
    const linksOf = async (name: string) =>
      (await app.inject({ method: 'GET', url: `/agents/${idOf(name)}/skills` })).json() as Link[];

    const security = await linksOf('Security Reviewer');
    expect(security.map((l) => l.name)).toEqual([
      'pr-quality-rubric',
      'no-then-chains',
      'secret-leakage-gate',
      'lethal-trifecta',
      'phantom-api-gate',
      'test-coverage-nudge',
    ]);
    expect(security.filter((l) => l.enabled).map((l) => l.name)).toEqual([
      'pr-quality-rubric',
      'no-then-chains',
      'secret-leakage-gate',
      'lethal-trifecta',
    ]);
    expect(security.filter((l) => !l.enabled).map((l) => l.name)).toEqual([
      'phantom-api-gate',
      'test-coverage-nudge',
    ]);

    const performance = await linksOf('Performance Reviewer');
    expect(performance.map((l) => l.name)).toEqual(['pr-quality-rubric']);
    const rubricId = security.find((l) => l.name === 'pr-quality-rubric')!.skill_id;
    expect(performance[0]!.skill_id).toBe(rubricId);
    expect(performance.some((l) => l.name === 'no-then-chains')).toBe(false);

    expect(await linksOf('General Reviewer')).toEqual([]);

    const tq = await linksOf('Test Quality Reviewer');
    expect(tq.map((l) => l.name)).toEqual(['uncovered-branches', 'corner-cases', 'excessive-mocking']);
    expect(tq.every((l) => l.enabled)).toBe(true);
    expect(tq.every((l) => l.type === 'custom' || l.type === 'rubric')).toBe(true);
    expect(tq.every((l) => l.description.trim().length > 0)).toBe(true);

    const api = await linksOf('API Contract Reviewer');
    expect(api.map((l) => l.name)).toEqual(['breaking-change', 'response-schema', 'semver-discipline']);
    expect(api.every((l) => l.enabled)).toBe(true);
    expect(api.every((l) => l.type === 'custom')).toBe(true);
    expect(api.every((l) => l.description.trim().length > 0)).toBe(true);
    await app.close();
  });

  it('import + enable + attach flaky-tests yields four ordered Test Quality links', async () => {
    const app = await makeApp();
    const md = readFileSync(FIXTURE_MD, 'utf8');
    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'flaky-tests.md', content_base64: Buffer.from(md, 'utf8').toString('base64') },
    });
    expect(preview.statusCode).toBe(200);
    const confirmed = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: {
        name: preview.json().name,
        description: preview.json().description,
        type: 'custom',
        body: preview.json().body,
      },
    });
    expect(confirmed.statusCode).toBe(201);
    const skillId = confirmed.json().id as string;

    const enabled = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { enabled: true },
    });
    expect(enabled.statusCode).toBe(200);

    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as {
      id: string;
      name: string;
    }[];
    const tqId = agents.find((a) => a.name === 'Test Quality Reviewer')!.id;
    const existing = (
      await app.inject({ method: 'GET', url: `/agents/${tqId}/skills` })
    ).json() as Array<{ skill_id: string; enabled: boolean }>;

    const attached = await app.inject({
      method: 'POST',
      url: `/agents/${tqId}/skills`,
      payload: {
        skills: [...existing.map((l) => ({ skill_id: l.skill_id, enabled: l.enabled })), { skill_id: skillId, enabled: true }],
      },
    });
    expect(attached.statusCode).toBe(200);

    const links = (
      await app.inject({ method: 'GET', url: `/agents/${tqId}/skills` })
    ).json() as Array<{ name: string }>;
    expect(links.map((l) => l.name)).toEqual([
      'uncovered-branches',
      'corner-cases',
      'excessive-mocking',
      'flaky-tests',
    ]);
    await app.close();
  });

  it('seeds PR #901 with a non-null pr_files.patch', async () => {
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 901)));
    expect(pr?.title).toMatch(/happy-path-only/i);
    expect(pr?.body).toMatch(/successful parse only/i);
    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id));
    expect(files.some((f) => typeof f.patch === 'string' && f.patch.includes('parseAmount'))).toBe(true);
  });

  it('import + enable + attach deprecation-policy yields four ordered API Contract links', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json() as unknown[];
    const md = readFileSync(DEPRECATION_MD, 'utf8');
    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'deprecation-policy.md', content_base64: Buffer.from(md, 'utf8').toString('base64') },
    });
    expect(preview.statusCode).toBe(200);
    const afterPreview = (await app.inject({ method: 'GET', url: '/skills' })).json() as unknown[];
    expect(afterPreview).toHaveLength(before.length);

    const confirmed = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: {
        name: preview.json().name,
        description: preview.json().description,
        type: 'custom',
        body: preview.json().body,
      },
    });
    expect(confirmed.statusCode).toBe(201);
    expect(confirmed.json().enabled).toBe(false);
    expect(confirmed.json().source).toBe('imported');
    const skillId = confirmed.json().id as string;

    const enabled = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { enabled: true },
    });
    expect(enabled.statusCode).toBe(200);

    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as {
      id: string;
      name: string;
    }[];
    const apiId = agents.find((a) => a.name === 'API Contract Reviewer')!.id;
    const existing = (
      await app.inject({ method: 'GET', url: `/agents/${apiId}/skills` })
    ).json() as Array<{ skill_id: string; enabled: boolean }>;
    const previousIds = existing.map((l) => l.skill_id);

    const attached = await app.inject({
      method: 'POST',
      url: `/agents/${apiId}/skills`,
      payload: {
        skills: [...existing.map((l) => ({ skill_id: l.skill_id, enabled: l.enabled })), { skill_id: skillId, enabled: true }],
      },
    });
    expect(attached.statusCode).toBe(200);

    const links = (
      await app.inject({ method: 'GET', url: `/agents/${apiId}/skills` })
    ).json() as Array<{ name: string; skill_id: string }>;
    expect(links.map((l) => l.name)).toEqual([
      'breaking-change',
      'response-schema',
      'semver-discipline',
      'deprecation-policy',
    ]);
    expect(links.slice(0, 3).map((l) => l.skill_id)).toEqual(previousIds);
    await app.close();
  });

  it('seeds PR #902 with a silent public-field rename patch', async () => {
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 902)));
    expect(pr?.title).toMatch(/rename|breaking/i);
    expect(pr?.body).toMatch(/rename|breaking/i);
    const files = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id));
    const patch = files.find((f) => typeof f.patch === 'string')?.patch ?? '';
    expect(patch).toContain('userId');
    expect(patch).toContain('user_id');
    expect(patch).not.toContain('deprecated');
  });
});
