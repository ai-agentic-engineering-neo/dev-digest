import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import type { SecretsProvider } from '@devdigest/shared';

/** BE-7 — every failure leaves the API as { error: { code, message } }. */

const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

async function app(overrides = {}, cfg = config) {
  return buildApp({ config: cfg, overrides });
}

describe('error envelope', () => {
  it('unknown route is a not_found envelope', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await a.close();
  });

  it('malformed JSON is a 400 invalid_json', async () => {
    const a = await app();
    a.post('/echo', async (req) => req.body);
    const res = await a.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_json');
    await a.close();
  });

  it('an oversized body is a 413 payload_too_large', async () => {
    const a = await app();
    a.post('/echo', async (req) => req.body);
    const res = await a.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ x: 'a'.repeat(1_048_576) }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('payload_too_large');
    await a.close();
  });

  it('a framework 429 is rate_limited', async () => {
    const a = await app();
    a.get('/limited', async () => {
      throw Object.assign(new Error('Rate limit exceeded, retry in 1 minute'), { statusCode: 429 });
    });
    const res = await a.inject({ method: 'GET', url: '/limited' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('rate_limited');
    await a.close();
  });

  it('a thrown non-AppError returns a generic 500 without its message', async () => {
    const a = await app();
    a.get('/boom', async () => {
      throw new Error('relation "reviews" does not exist');
    });
    const res = await a.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toEqual({ code: 'internal_error', message: 'Internal error' });
    await a.close();
  });

  it('shows the raw message in development only', async () => {
    const dev = { ...config, nodeEnv: 'development' as const, logLevel: 'silent' as const };
    const a = await app({}, dev);
    a.get('/boom', async () => {
      throw new Error('relation "reviews" does not exist');
    });
    const res = await a.inject({ method: 'GET', url: '/boom' });
    expect(res.json().error.message).toBe('relation "reviews" does not exist');
    await a.close();
  });

  it('a missing GitHub token is a 409 not_configured', async () => {
    const secrets = { get: async () => undefined } as unknown as SecretsProvider;
    const a = await app({ secrets });
    a.get('/gh', async () => {
      await a.container.github();
      return {};
    });
    const res = await a.inject({ method: 'GET', url: '/gh' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('not_configured');
    await a.close();
  });
});
