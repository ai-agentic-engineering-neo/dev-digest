import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { hostnameOf, isAllowedHost, isAllowedOrigin } from '../src/platform/local-only.js';

/** S2 (security hardening) — loopback bind + Host/Origin guard. */

describe('local-only helpers', () => {
  it.each([
    ['localhost:3001', 'localhost'],
    ['LOCALHOST', 'localhost'],
    ['127.0.0.1:3001', '127.0.0.1'],
    ['[::1]:3001', '::1'],
    ['localhost.:3001', 'localhost'],
    ['', null],
    [undefined, null],
    ['[::1', null],
  ])('hostnameOf(%s) → %s', (header, expected) => {
    expect(hostnameOf(header)).toBe(expected);
  });

  const hosts = ['localhost', '127.0.0.1', '::1'];
  it('allows loopback names only', () => {
    expect(isAllowedHost('localhost:3001', hosts)).toBe(true);
    expect(isAllowedHost('[::1]:3001', hosts)).toBe(true);
    expect(isAllowedHost('attacker.tld:3001', hosts)).toBe(false);
    expect(isAllowedHost('localhost.attacker.tld', hosts)).toBe(false);
    expect(isAllowedHost(undefined, hosts)).toBe(false);
  });

  const origins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  it('allows a missing Origin (non-browser clients) and our own web origin', () => {
    expect(isAllowedOrigin(undefined, origins)).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000', origins)).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000/', origins)).toBe(true);
    expect(isAllowedOrigin('http://evil.tld', origins)).toBe(false);
    expect(isAllowedOrigin('null', origins)).toBe(false);
    expect(isAllowedOrigin('http://localhost:3001', origins)).toBe(false);
  });
});

describe('config', () => {
  it('binds to loopback by default and accepts extra hosts from API_ALLOWED_HOSTS', () => {
    const base = { ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv;
    delete base.API_HOST;
    delete base.API_ALLOWED_HOSTS;
    expect(loadConfig(base).apiHost).toBe('127.0.0.1');
    const custom = loadConfig({ ...base, API_HOST: '0.0.0.0', API_ALLOWED_HOSTS: 'devbox.local, 10.0.0.5' });
    expect(custom.apiHost).toBe('0.0.0.0');
    expect(custom.allowedHosts).toEqual(expect.arrayContaining(['devbox.local', '10.0.0.5']));
  });
});

describe('onRequest guard (app.inject)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test', WEB_PORT: '3000' } as NodeJS.ProcessEnv);
    app = await buildApp({ config });
  });
  afterAll(async () => {
    await app.close();
  });

  it('serves a loopback Host with no Origin', async () => {
    const res = await app.inject({ method: 'GET', url: '/health', headers: { host: 'localhost:3001' } });
    expect(res.statusCode).toBe(200);
  });

  it('serves our own web origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: '127.0.0.1:3001', origin: 'http://localhost:3000' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects a rebound Host (DNS rebinding)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health', headers: { host: 'attacker.tld:3001' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden_host');
  });

  it('rejects a foreign Origin, including on state-changing routes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/repos',
      headers: { host: 'localhost:3001', origin: 'http://evil.tld', 'content-type': 'text/plain' },
      payload: '{"url":"https://github.com/a/b"}',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden_origin');
  });
});
