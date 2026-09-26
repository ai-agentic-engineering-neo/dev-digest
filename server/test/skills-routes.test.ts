/**
 * skills — route smoke test. No database: `auth` and `skillsRepo` are swapped
 * through `ContainerOverrides`, so the request goes route → service → fake port
 * and back through the real error handler.
 */
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import type { SkillDto, SkillsRepositoryPort } from '../src/modules/skills/ports.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const skill: SkillDto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'pr-quality-rubric',
  description: '',
  type: 'rubric',
  source: 'manual',
  body: 'b',
  enabled: true,
  version: 1,
  evidence_files: null,
};
const fake: SkillsRepositoryPort = {
  list: async () => [skill],
  getById: async (_w, id) => (id === skill.id ? skill : undefined),
  findByName: async () => undefined,
  create: async (_w, input) => ({ ...skill, ...input }),
  update: async (_w, id, patch, opts) =>
    id === skill.id ? { ...skill, ...patch, version: opts.bumpVersion ? 2 : 1 } : undefined,
  delete: async (_w, id) => id === skill.id,
};

const makeApp = () => buildApp({ config, overrides: { auth: new MockAuthProvider(), skillsRepo: fake } });

describe('skills routes (no DB)', () => {
  it('GET /skills goes route → service → fake port', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/skills' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([skill]);
    await app.close();
  });

  it('POST /skills validates the kebab-case name and the type at the edge (422 envelope)', async () => {
    const app = await makeApp();
    const badType = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'x', type: 'nope', body: 'b' },
    });
    expect(badType.statusCode).toBe(422);
    expect(badType.json().error.code).toBe('validation_error');

    const badName = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'PR Quality', type: 'rubric', body: 'b' },
    });
    expect(badName.statusCode).toBe(422);

    const ok = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'no-then-chains', type: 'convention', body: 'b' },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ name: 'no-then-chains', type: 'convention', source: 'manual' });
    await app.close();
  });

  it('POST /skills/import/preview parses a base64 upload into a preview without saving', async () => {
    const app = await makeApp();
    const file = '---\nname: imported-rule\ndescription: Do the thing.\ntype: rubric\n---\n# Imported\nBody.';
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'imported-rule.md', content_base64: Buffer.from(file).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'imported-rule', type: 'rubric', body: '# Imported\nBody.', ignored_files: [] });

    const bad = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.pdf', content_base64: Buffer.from('x').toString('base64') },
    });
    expect(bad.statusCode).toBe(422);
    const notB64 = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'x.md', content_base64: 'not base64!!' },
    });
    expect(notB64.statusCode).toBe(422);
    await app.close();
  });

  it('PUT /skills/:id with a changed body returns the bumped version; DELETE returns ok', async () => {
    const app = await makeApp();
    const put = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'new body' } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ body: 'new body', version: 2 });

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    const missing = await app.inject({ method: 'GET', url: '/skills/22222222-2222-4222-8222-222222222222' });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});
