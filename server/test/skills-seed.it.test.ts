import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
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

  it('is idempotent: unique catalog names and one Test Quality Reviewer', async () => {
    const app = await makeApp();
    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json() as { name: string }[];
    const names = skills.map((s) => s.name);
    for (const name of CATALOG_NAMES) {
      expect(names.filter((n) => n === name)).toHaveLength(1);
    }
    expect(names).toContain('uncovered-branches');
    expect(names).toContain('corner-cases');
    expect(names).toContain('excessive-mocking');
    expect(names).not.toContain('flaky-tests');

    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as { name: string }[];
    expect(agents.filter((a) => a.name === 'Test Quality Reviewer')).toHaveLength(1);
    await app.close();
  });

  it('seeds the Security / Performance / General / Test Quality link matrix', async () => {
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
});
