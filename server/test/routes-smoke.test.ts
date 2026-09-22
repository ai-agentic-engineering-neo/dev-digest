import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * No-DB route smoke tests via app.inject(). `/health` and the validation/error
 * envelope don't touch the database (postgres-js connects lazily), so these run
 * without Docker. DB-backed routes are covered in integration.test.ts.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('routes (no DB)', () => {
  it('GET /health → ok', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('POST /settings/test-connection (github) returns structured ConnTestResult', async () => {
    const app = await buildApp({
      config,
      overrides: { github: new MockGitHubClient({ login: 'octocat' }) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'github' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.provider).toBe('github');
    expect(body.ok).toBe(true);
    expect(body.message).toContain('octocat');
    await app.close();
  });

  it('POST /settings/test-connection (openai) uses injected LLM listModels', async () => {
    const app = await buildApp({
      config,
      overrides: {
        llm: { openai: new MockLLMProvider('openai', { models: [{ id: 'gpt-4.1', provider: 'openai' }] }) },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'openai' },
    });
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it('unexpected 5xx errors return a generic message (no raw e.message leak)', async () => {
    const app = await buildApp({ config });
    app.get('/__boom', async () => {
      throw new Error('relation "secret_table" does not exist at postgres://u:p@db');
    });
    app.get('/__boom502', async () => {
      throw Object.assign(new Error('upstream said: token=abc'), { statusCode: 502 });
    });
    for (const url of ['/__boom', '/__boom502']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
      expect(res.json()).toEqual({ error: { code: 'internal_error', message: 'Internal error' } });
    }
    await app.close();
  });

  it('non-AppError 4xx errors keep their status and message', async () => {
    const app = await buildApp({ config });
    app.get('/__conflict', async () => {
      throw Object.assign(new Error('already exists'), { statusCode: 409 });
    });
    const res = await app.inject({ method: 'GET', url: '/__conflict' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toBe('already exists');
    await app.close();
  });

  it('POST /repos rejects a path-traversal URL at the schema (422)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://github.com/../src' },
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.stringify(res.json())).toContain('GitHub repository URL');
    await app.close();
  });

  it('returns 422 structured error on invalid body', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'not-a-provider' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
});
