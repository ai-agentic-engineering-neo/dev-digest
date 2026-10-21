/** project-context: route smoke test without a database (service built from fakes). */
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import { AGENT_ID, REPO_ID, SKILL_ID, makeFakes } from './helpers/project-context.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const FILES = { 'specs/a.md': 'spec text', 'docs/b.md': 'doc text' };

const makeApp = (opts: Parameters<typeof makeFakes>[0] = { files: FILES }) =>
  buildApp({ config, overrides: { auth: new MockAuthProvider(), projectContext: makeFakes(opts).service } });

describe('project-context routes (no DB)', () => {
  it('GET /repos/:id/context returns SpecFile rows (AC-1)', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${REPO_ID}/context` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
    expect(res.json()[0]).toMatchObject({ path: 'docs/b.md', kind: 'docs', tokens: 2 });
    expect((await app.inject({ method: 'GET', url: `/repos/${REPO_ID}/context?refresh=true` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/repos/${REPO_ID}/context?refresh=maybe` })).statusCode).toBe(422);
    await app.close();
  });

  it('unknown repo 404, not cloned 409, both in the standard envelope (AC-12)', async () => {
    const app = await makeApp();
    const missing = await app.inject({ method: 'GET', url: '/repos/22222222-2222-4222-8222-222222222222/context' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
    await app.close();
    const noClone = await makeApp({ files: FILES, repo: { clonePath: null } });
    const res = await noClone.inject({ method: 'GET', url: `/repos/${REPO_ID}/context` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'conflict', details: { reason: 'repo_not_cloned' } });
    await noClone.close();
  });

  it('GET /repos/:id/context/file: text, 422 unsafe, 404 unknown (AC-9)', async () => {
    const app = await makeApp();
    const ok = await app.inject({ method: 'GET', url: `/repos/${REPO_ID}/context/file?path=specs/a.md` });
    expect(ok.json()).toMatchObject({ path: 'specs/a.md', text: 'spec text' });
    expect((await app.inject({ method: 'GET', url: `/repos/${REPO_ID}/context/file?path=../x.md` })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: `/repos/${REPO_ID}/context/file?path=docs/none.md` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/repos/${REPO_ID}/context/file` })).statusCode).toBe(422);
    await app.close();
  });

  it('PUT/GET agent and skill context; bad body 422 (AC-16, 18)', async () => {
    const app = await makeApp();
    for (const [kind, id] of [['agents', AGENT_ID], ['skills', SKILL_ID]] as const) {
      const put = await app.inject({
        method: 'PUT',
        url: `/${kind}/${id}/context`,
        payload: { repo_id: REPO_ID, paths: ['specs/a.md', 'docs/b.md'] },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json().map((a: { path: string }) => a.path)).toEqual(['specs/a.md', 'docs/b.md']);
      const get = await app.inject({ method: 'GET', url: `/${kind}/${id}/context?repo_id=${REPO_ID}` });
      expect(get.json()).toHaveLength(2);
      const bad = await app.inject({
        method: 'PUT',
        url: `/${kind}/${id}/context`,
        payload: { repo_id: REPO_ID, paths: ['nope.md'] },
      });
      expect(bad.statusCode).toBe(422);
      expect(bad.json().error.details.issues[0]).toEqual({ path: 'nope.md', reason: 'unknown' });
      expect(
        (await app.inject({ method: 'PUT', url: `/${kind}/${id}/context`, payload: { repo_id: 'x', paths: [] } })).statusCode,
      ).toBe(422);
    }
    await app.close();
  });

  describe('override routes (AC-46 to AC-50)', () => {
    const url = `/repos/${REPO_ID}/context/file`;
    const put = (app: Awaited<ReturnType<typeof makeApp>>, payload: unknown) =>
      app.inject({ method: 'PUT', url, payload: payload as Record<string, unknown> });

    it('PUT saves, GET returns the effective text, DELETE resets', async () => {
      const app = await makeApp();
      const saved = await put(app, { path: 'specs/a.md', text: 'mine' });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({ text: 'mine', modified: true, repo_text: 'spec text' });
      const got = await app.inject({ method: 'GET', url: `${url}?path=specs/a.md` });
      expect(got.json()).toMatchObject({ text: 'mine', modified: true });
      const list = await app.inject({ method: 'GET', url: `/repos/${REPO_ID}/context` });
      expect(list.json().find((f: { path: string }) => f.path === 'specs/a.md')).toMatchObject({ modified: true });
      const reset = await app.inject({ method: 'DELETE', url: `${url}?path=specs/a.md` });
      expect(reset.json()).toMatchObject({ text: 'spec text', modified: false });
      // EC-26: a second reset still succeeds
      expect((await app.inject({ method: 'DELETE', url: `${url}?path=specs/a.md` })).statusCode).toBe(200);
      await app.close();
    });

    it('422 envelope for unsafe, unlisted, empty, over-cap and NUL bodies (AC-47, TC-3)', async () => {
      const app = await makeApp();
      for (const body of [
        { path: '../x.md', text: 'a' },
        { path: 'docs/none.md', text: 'a' },
        { path: 'specs/a.md', text: '' },
        { path: 'specs/a.md', text: 'x'.repeat(200_001) },
        { path: 'specs/a.md', text: 'a\u0000b' },
        { path: 'specs/a.md' },
      ]) {
        const res = await put(app, body);
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBeTruthy();
      }
      const list = await app.inject({ method: 'GET', url: `/repos/${REPO_ID}/context` });
      expect(list.json().every((f: { modified: boolean }) => f.modified === false)).toBe(true);
      await app.close();
    });

    it('a 200,000-character text of 4-byte characters passes the body limit (TC-4, EC-22)', async () => {
      const app = await makeApp();
      // 100,000 emoji = 200,000 UTF-16 code units (JS length), 400,000 bytes
      const text = '\u{1F600}'.repeat(100_000);
      expect(text.length).toBe(200_000);
      const res = await put(app, { path: 'specs/a.md', text });
      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it('DELETE on an unlisted path is 404, unsafe 422; no clone is 409 and writes nothing (D3, EC-31)', async () => {
      const app = await makeApp();
      expect((await app.inject({ method: 'DELETE', url: `${url}?path=docs/none.md` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'DELETE', url: `${url}?path=../x.md` })).statusCode).toBe(422);
      await app.close();
      const noClone = await makeApp({ files: FILES, repo: { clonePath: null } });
      expect((await put(noClone, { path: 'specs/a.md', text: 'x' })).statusCode).toBe(409);
      await noClone.close();
    });
  });
});
