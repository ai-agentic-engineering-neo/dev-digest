import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

/**
 * @fastify/rate-limit is only registered when nodeEnv !== 'test', so these tests
 * build the app in 'production' mode. LOG_LEVEL=silent turns the logger off, so
 * app.log / req.log methods are no-ops that can be spied on or replaced.
 */
const config = loadConfig({
  ...process.env,
  NODE_ENV: 'production',
  LOG_LEVEL: 'silent',
} as NodeJS.ProcessEnv);

/**
 * With LOG_LEVEL=silent the app runs `logger: false`, whose child() returns the SAME object,
 * so req.log === app.log and a request-logger assertion can't tell them apart. The 429 test
 * therefore uses a real (warn-level) pino logger; its warn/error calls are mocked out below.
 */
const warnConfig = loadConfig({
  ...process.env,
  NODE_ENV: 'production',
  LOG_LEVEL: 'warn',
} as NodeJS.ProcessEnv);

describe('global rate limit: RATE_LIMIT_MAX', () => {
  it('defaults to 120 and reads RATE_LIMIT_MAX (empty → default)', () => {
    const base = { ...process.env, NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    delete base.RATE_LIMIT_MAX;
    expect(loadConfig(base).rateLimitMax).toBe(120);
    expect(loadConfig({ ...base, RATE_LIMIT_MAX: '' }).rateLimitMax).toBe(120);
    expect(loadConfig({ ...base, RATE_LIMIT_MAX: '2000' }).rateLimitMax).toBe(2000);
    expect(() => loadConfig({ ...base, RATE_LIMIT_MAX: '0' })).toThrow();
  });

  it('the global cap applies the configured max (3rd request over max 2 → 429)', async () => {
    const app = await buildApp({ config: { ...config, rateLimitMax: 2 } });
    app.get('/__global-probe', async () => ({ ok: true }));
    vi.spyOn(app.log, 'warn').mockImplementation(() => undefined);
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await app.inject({ method: 'GET', url: '/__global-probe' })).statusCode);
    expect(codes).toEqual([200, 200, 429]);
    await app.close();
  });
});

describe('error handler: rate limiting', () => {
  it('429 from @fastify/rate-limit → code rate_limited, warn level on the request logger, retry-after kept', async () => {
    const app = await buildApp({ config: warnConfig });
    app.get(
      '/__rl-probe',
      { config: { rateLimit: { max: 1, timeWindow: '1 minute' } } },
      async () => ({ ok: true }),
    );
    // The 429 is logged on the per-request child logger (carries reqId). An app-level onRequest
    // hook runs before the route-level rate-limit hook, so the spy is attached in time.
    const reqWarns: ReturnType<typeof vi.fn>[] = [];
    app.addHook('onRequest', async (req) => {
      expect(req.log).not.toBe(app.log); // a real per-request child logger
      const spy = vi.fn();
      req.log.warn = spy as unknown as typeof req.log.warn;
      reqWarns.push(spy);
    });
    const appWarn = vi.spyOn(app.log, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(app.log, 'error').mockImplementation(() => undefined);

    const first = await app.inject({ method: 'GET', url: '/__rl-probe' });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: 'GET', url: '/__rl-probe' });
    expect(second.statusCode).toBe(429);
    expect(second.json().error.code).toBe('rate_limited');
    expect(second.headers['retry-after']).toBeDefined();
    expect(reqWarns).toHaveLength(2);
    expect(reqWarns[0]).not.toHaveBeenCalled();
    expect(reqWarns[1]).toHaveBeenCalledTimes(1);
    expect(reqWarns[1]).toHaveBeenCalledWith({ statusCode: 429, url: '/__rl-probe' }, 'rate limited');
    expect(appWarn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    await app.close();
  });

  it('unexpected errors still map to 500 internal_error and log at error level', async () => {
    const app = await buildApp({ config });
    app.get('/__boom-probe', async () => {
      throw new Error('boom');
    });
    const error = vi.spyOn(app.log, 'error');

    const res = await app.inject({ method: 'GET', url: '/__boom-probe' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('internal_error');
    expect(error).toHaveBeenCalled();
    await app.close();
  });
});
