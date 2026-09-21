import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockWebFetcher } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD, body versioning, import preview, and the agent link/order/enable
 * path — the wiring that only breaks against a real database (SQL, cascades,
 * the composite primary key on agent_skills).
 */
d('skills module', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(webFetcher?: MockWebFetcher) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        ...(webFetcher ? { webFetcher } : {}),
      },
    });
  }

  const newSkill = (over: Record<string, unknown> = {}) => ({
    name: `skill-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Flag X.',
    type: 'custom' as const,
    body: '# Rule\nDo the thing.',
    ...over,
  });

  it('creates a skill, lists it, and records version 1', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: newSkill() });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill.version).toBe(1);
    // A hand-written skill is trusted by default; an imported one is not.
    expect(skill.enabled).toBe(true);
    expect(skill.source).toBe('manual');

    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.json().some((s: { id: string }) => s.id === skill.id)).toBe(true);

    const versions = await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` });
    expect(versions.json()).toHaveLength(1);
    expect(versions.json()[0]).toMatchObject({ version: 1, body: '# Rule\nDo the thing.' });
  });

  it('bumps the version and snapshots ONLY when the body changes', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: newSkill() })).json().id;

    const renamed = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { name: 'renamed-skill', description: 'Different blurb.' },
    });
    expect(renamed.json().version).toBe(1);

    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# Rule\nDo the thing, but better.' },
    });
    expect(edited.json().version).toBe(2);

    const versions = await app.inject({ method: 'GET', url: `/skills/${id}/versions` });
    // Newest first, and the rename did not mint a duplicate snapshot.
    expect(versions.json().map((v: { version: number }) => v.version)).toEqual([2, 1]);
  });

  it('toggling enabled does not create a version', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: newSkill() })).json().id;

    const off = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { enabled: false } });
    expect(off.json()).toMatchObject({ enabled: false, version: 1 });
    expect((await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json()).toHaveLength(1);
  });

  it('404s for an unknown skill and deletes a real one', async () => {
    const app = await makeApp();
    const missing = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/skills/${missing}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${missing}` })).statusCode).toBe(404);

    const id = (await app.inject({ method: 'POST', url: '/skills', payload: newSkill() })).json().id;
    expect((await app.inject({ method: 'DELETE', url: `/skills/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
  });

  it('rejects a body over the size budget', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: newSkill({ body: 'x'.repeat(70_000) }),
    });
    expect(res.statusCode).toBe(422);
  });

  describe('import', () => {
    it('previews a document without persisting anything', async () => {
      const app = await makeApp();
      const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;

      const res = await app.inject({
        method: 'POST',
        url: '/skills/import/preview',
        payload: {
          text: '---\nname: imported-gate\ndescription: Catch X.\ntype: security\n---\n# Imported gate\n\nRules here.',
          origin: 'gate.zip › SKILL.md',
          skipped_entries: ['scripts/install.sh', 'bin/run'],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        name: 'imported-gate',
        type: 'security',
        source: 'imported_file',
        skipped_entries: ['scripts/install.sh', 'bin/run'],
      });
      // The whole point of preview: nothing was written.
      expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);
    });

    it('saves an imported skill DISABLED, so it cannot silently join a prompt', async () => {
      const app = await makeApp();
      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: newSkill({ source: 'imported_url', enabled: false }),
      });
      expect(res.json()).toMatchObject({ source: 'imported_url', enabled: false });
    });

    it('fetches a URL through the WebFetcher port and previews it', async () => {
      const fetcher = new MockWebFetcher({ text: '# Fetched skill\n\nA fetched rule.' });
      const app = await makeApp(fetcher);

      const res = await app.inject({
        method: 'POST',
        url: '/skills/import/url',
        payload: { url: 'https://example.com/skill.md' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: 'Fetched skill', source: 'imported_url' });
      expect(fetcher.calls).toEqual(['https://example.com/skill.md']);
    });

    it('surfaces a guard refusal as a 422, not a 500', async () => {
      const app = await makeApp(
        new MockWebFetcher({}, 'Refusing to fetch "internal" — it resolves to a private address.'),
      );
      const res = await app.inject({
        method: 'POST',
        url: '/skills/import/url',
        payload: { url: 'http://internal/skill.md' },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toMatch(/private address/);
    });

    it('rejects a malformed URL at the schema edge', async () => {
      const app = await makeApp();
      const res = await app.inject({
        method: 'POST',
        url: '/skills/import/url',
        payload: { url: 'not-a-url' },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('agent links', () => {
    async function makeAgent(app: Awaited<ReturnType<typeof makeApp>>) {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: `Linker ${Math.random().toString(36).slice(2, 8)}`,
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      });
      return res.json().id as string;
    }

    it('sets an ordered set of links and echoes it back joined with each skill', async () => {
      const app = await makeApp();
      const agentId = await makeAgent(app);
      const a = (await app.inject({ method: 'POST', url: '/skills', payload: newSkill({ name: 'link-a' }) })).json();
      const b = (await app.inject({ method: 'POST', url: '/skills', payload: newSkill({ name: 'link-b' }) })).json();

      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skills: [{ skill_id: b.id, enabled: true }, { skill_id: a.id, enabled: false }] },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject([
        { order: 0, enabled: true, skill: { id: b.id, name: 'link-b' } },
        { order: 1, enabled: false, skill: { id: a.id, name: 'link-a' } },
      ]);
    });

    it('reports agent_count on list and detail, counting links rather than enabled links', async () => {
      const app = await makeApp();
      const one = await makeAgent(app);
      const two = await makeAgent(app);
      const skill = (
        await app.inject({ method: 'POST', url: '/skills', payload: newSkill() })
      ).json();

      // Nothing links it yet — 0, not null, so the card can render a number.
      expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json().agent_count)
        .toBe(0);

      // The second agent has it switched OFF: the count answers "who holds this
      // skill", which includes an agent that has it parked.
      await app.inject({
        method: 'POST',
        url: `/agents/${one}/skills`,
        payload: { skills: [{ skill_id: skill.id, enabled: true }] },
      });
      await app.inject({
        method: 'POST',
        url: `/agents/${two}/skills`,
        payload: { skills: [{ skill_id: skill.id, enabled: false }] },
      });

      expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json().agent_count)
        .toBe(2);
      const listed = (await app.inject({ method: 'GET', url: '/skills' })).json();
      expect(listed.find((s: { id: string }) => s.id === skill.id).agent_count).toBe(2);

      // Unlinking from one agent drops the count by one.
      await app.inject({ method: 'POST', url: `/agents/${two}/skills`, payload: { skills: [] } });
      expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json().agent_count)
        .toBe(1);

      // An edit must not blank the count out — the client writes this response
      // straight into its cache.
      const updated = await app.inject({
        method: 'PUT',
        url: `/skills/${skill.id}`,
        payload: { body: '# Rule\nChanged.' },
      });
      expect(updated.json().agent_count).toBe(1);
    });

    it('a reorder is a full replace — order follows the array, not the ids', async () => {
      const app = await makeApp();
      const agentId = await makeAgent(app);
      const a = (await app.inject({ method: 'POST', url: '/skills', payload: newSkill() })).json();
      const b = (await app.inject({ method: 'POST', url: '/skills', payload: newSkill() })).json();

      await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skill_ids: [a.id, b.id] },
      });
      const reordered = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skill_ids: [b.id, a.id] },
      });

      expect(reordered.json().map((l: { skill: { id: string } }) => l.skill.id)).toEqual([b.id, a.id]);
    });

    it('a skill omitted from the set is unlinked', async () => {
      const app = await makeApp();
      const agentId = await makeAgent(app);
      const a = (await app.inject({ method: 'POST', url: '/skills', payload: newSkill() })).json();
      const b = (await app.inject({ method: 'POST', url: '/skills', payload: newSkill() })).json();

      await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skill_ids: [a.id, b.id] },
      });
      const after = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skill_ids: [a.id] },
      });

      expect(after.json()).toHaveLength(1);
      expect(after.json()[0].skill.id).toBe(a.id);
    });

    it('deleting a skill cascades its agent links away', async () => {
      const app = await makeApp();
      const agentId = await makeAgent(app);
      const skill = (await app.inject({ method: 'POST', url: '/skills', payload: newSkill() })).json();

      await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skill_ids: [skill.id] },
      });
      await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });

      const links = await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` });
      expect(links.json()).toHaveLength(0);
    });

    it('seeds the built-in agents with their skills linked and enabled', async () => {
      const app = await makeApp();
      const agents = (await app.inject({ method: 'GET', url: '/agents' })).json();
      const testQuality = agents.find((a: { name: string }) => a.name === 'Test Quality Reviewer');
      expect(testQuality).toBeDefined();

      const links = (
        await app.inject({ method: 'GET', url: `/agents/${testQuality.id}/skills` })
      ).json();
      expect(links.map((l: { skill: { name: string } }) => l.skill.name)).toEqual([
        'test-quality-rubric',
      ]);
      expect(links[0].enabled).toBe(true);
    });
  });
});
