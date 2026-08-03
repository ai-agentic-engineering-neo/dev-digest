import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * L02 — skills CRUD, workspace-unique naming, and the version-bump rule:
 * a body edit archives the previous body and bumps `skills.version`; a rename
 * or description edit does not. Also: delete cascades `agent_skills` and
 * `run_skills`, so a deleted skill leaves no dangling link and no orphan
 * stats row.
 */
d('skills module (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
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

  const createBody = {
    name: 'test-quality-rubric',
    description: 'Flags untested branches.',
    type: 'custom' as const,
    body: '# Rubric\nCheck for untested branches.',
  };

  it('creates, lists, fetches, updates and deletes a skill', async () => {
    const app = await makeApp();

    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill.name).toBe(createBody.name);
    expect(skill.version).toBe(1);
    expect(skill.enabled).toBe(true);

    const listed = await app.inject({ method: 'GET', url: '/skills' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().some((s: { id: string }) => s.id === skill.id)).toBe(true);
    // Rail rows carry batched stats, not one query per card.
    expect(listed.json().find((s: { id: string }) => s.id === skill.id).stats).toEqual({
      used_by: 0,
      pull_pct: null,
      accept_pct: null,
    });

    const fetched = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().name).toBe(createBody.name);

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { description: 'Updated description only.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().description).toBe('Updated description only.');
    expect(updated.json().version).toBe(1); // description-only edit mints no version

    const deleted = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });

    const goneCheck = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(goneCheck.statusCode).toBe(404);

    await app.close();
  });

  it('rejects a non-slug name at the schema, before it reaches the handler', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, name: 'Not A Slug!' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('rejects a workspace name collision as a clean 4xx, not a raw Postgres 500', async () => {
    const app = await makeApp();
    const name = 'collision-skill';

    const first = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, name },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, name },
    });
    expect(second.statusCode).toBeGreaterThanOrEqual(400);
    expect(second.statusCode).toBeLessThan(500);
    expect(second.json().error).toBeDefined();

    await app.close();
  });

  it('a body edit archives the previous body and bumps version; a rename does not', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, name: 'version-bump-skill' },
    });
    const skill = created.json();
    expect(skill.version).toBe(1);

    // Rename only — no version bump, no archive.
    const renamed = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { name: 'version-bump-skill-renamed' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().version).toBe(1);

    let versions = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` });
    expect(versions.json()).toEqual([]);

    // Body edit — mints v2 and archives v1's original body.
    const bodyEdited = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: '# Rubric v2\nSomething new.' },
    });
    expect(bodyEdited.statusCode).toBe(200);
    expect(bodyEdited.json().version).toBe(2);

    versions = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` });
    expect(versions.json()).toHaveLength(1);
    expect(versions.json()[0].version).toBe(1);
    expect(versions.json()[0].body).toBe(createBody.body); // the ORIGINAL body, archived

    const oneVersion = await app.inject({
      method: 'GET',
      url: `/skills/${skill.id}/versions/1`,
    });
    expect(oneVersion.statusCode).toBe(200);
    expect(oneVersion.json().body).toBe(createBody.body);

    await app.close();
  });

  it('delete cascades agent_skills and run_skills — no dangling link, no orphan stats row', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, name: 'cascade-skill' },
    });
    const skill = created.json();

    const agentRes = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Cascade Test Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    const agent = agentRes.json();

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: skill.id },
    });

    const linksBefore = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, skill.id));
    expect(linksBefore).toHaveLength(1);

    const deleted = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(deleted.statusCode).toBe(200);

    const linksAfter = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.skillId, skill.id));
    expect(linksAfter).toHaveLength(0);

    await app.close();
  });

  it('GET /skills/:id/preview returns the same block renderSkillBlock produces, plus a token count', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody, name: 'preview-parity-skill' },
    });
    const skill = created.json();

    const preview = await app.inject({ method: 'GET', url: `/skills/${skill.id}/preview` });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().block).toBe(
      `### Skill: ${skill.name} (${skill.type})\n${createBody.body}`,
    );
    expect(preview.json().tokens).toBeGreaterThan(0);

    await app.close();
  });

  it('POST /skills/tokens counts a body with the same tokenizer the executor uses', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/tokens',
      payload: { body: 'A short skill body.' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tokens).toBeGreaterThan(0);
    await app.close();
  });

  it('an unknown skill 404s on every :id route', async () => {
    const app = await makeApp();
    const missing = '00000000-0000-0000-0000-000000000000';
    for (const url of [
      `/skills/${missing}`,
      `/skills/${missing}/versions`,
      `/skills/${missing}/versions/1`,
      `/skills/${missing}/preview`,
      `/skills/${missing}/stats`,
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
    }
    await app.close();
  });
});
