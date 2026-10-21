/**
 * skills — route smoke test. Lives at `server/test/skills-routes.test.ts`.
 * No database: `auth` and `skillsRepo` are swapped through `ContainerOverrides`,
 * so the request goes route → service → fake port and back through the
 * real error handler.
 */
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import type { SkillDto, SkillsRepositoryPort } from '../src/modules/skills/ports.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const skill: SkillDto = {
  id: 'a', name: 'n', description: '', type: 'rubric', source: 'manual',
  body: 'b', enabled: true, version: 1, created_at: '1970-01-01T00:00:00.000Z',
};
const fake: SkillsRepositoryPort = {
  list: async () => [skill],
  getById: async (_w, id) => (id === skill.id ? skill : undefined),
  create: async () => skill,
  saveNewVersion: async () => skill,
};

describe('skills routes (no DB)', () => {
  it('GET /skills goes route → service → fake port', async () => {
    const app = await buildApp({ config, overrides: { auth: new MockAuthProvider(), skillsRepo: fake } });
    const res = await app.inject({ method: 'GET', url: '/skills' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([skill]);
    await app.close();
  });

  it('POST /skills validates at the edge (422 envelope)', async () => {
    const app = await buildApp({ config, overrides: { auth: new MockAuthProvider(), skillsRepo: fake } });
    const res = await app.inject({ method: 'POST', url: '/skills', payload: { name: 'x', type: 'nope', body: 'b' } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
});
