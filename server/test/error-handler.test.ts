import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import {
  AppError,
  ConflictError,
  ExternalServiceError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  type ErrorKind,
} from '../src/platform/errors.js';
import { STATUS_BY_KIND } from '../src/http/error-handler.js';

/** The http edge owns the kind → status table; inner errors carry no status. */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('error handler (no DB)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ config });
    const routes: Record<string, () => never> = {
      '/__nf': () => { throw new NotFoundError('Agent not found'); },
      '/__conflict': () => { throw new ConflictError('Name taken', { field: 'name' }); },
      '/__forbidden': () => { throw new ForbiddenError(); },
      '/__invalid': () => { throw new InvalidInputError('Provide agentId', undefined, 'invalid_run_request'); },
      '/__upstream': () => { throw new ExternalServiceError('LLM output failed schema validation'); },
      '/__legacy': () => { throw new AppError('github_unavailable', 'Connect a token', 400); },
      '/__legacy409': () => { throw new AppError('dup', 'dup', 409); },
      '/__legacy_nostatus': () => { throw new AppError('bad', 'bad thing'); },
      '/__zod_internal': () => { z.object({ a: z.string() }).parse({ a: 1 }); throw new Error('unreachable'); },
    };
    for (const [url, h] of Object.entries(routes)) app.get(url, async () => h());
  });
  afterAll(() => app.close());

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('maps error kinds to statuses with the stable envelope', async () => {
    const nf = await get('/__nf');
    expect(nf.statusCode).toBe(404);
    expect(nf.json()).toEqual({ error: { code: 'not_found', message: 'Agent not found' } });

    const c = await get('/__conflict');
    expect(c.statusCode).toBe(409);
    expect(c.json()).toEqual({ error: { code: 'conflict', message: 'Name taken', details: { field: 'name' } } });

    expect((await get('/__forbidden')).statusCode).toBe(403);

    const inv = await get('/__invalid');
    expect(inv.statusCode).toBe(400);
    expect(inv.json().error.code).toBe('invalid_run_request');

    const up = await get('/__upstream');
    expect(up.statusCode).toBe(502);
    expect(up.json().error).toMatchObject({ code: 'external_service_error' });
  });

  it('keeps legacy new AppError(code, message, status) call sites working', async () => {
    expect((await get('/__legacy')).json()).toEqual({ error: { code: 'github_unavailable', message: 'Connect a token' } });
    expect((await get('/__legacy')).statusCode).toBe(400);
    expect((await get('/__legacy409')).statusCode).toBe(409);
    expect((await get('/__legacy_nostatus')).statusCode).toBe(400);
  });

  it('a ZodError that is not request validation is a 500, not a 422', async () => {
    const res = await get('/__zod_internal');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: 'internal_error', message: 'Internal error' } });
  });

  it('unknown routes answer 404 with the same envelope', async () => {
    const res = await get('/no/such/route?x=1');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'Route GET /no/such/route not found' } });
  });

  it('every error kind has an HTTP status', () => {
    const kinds: ErrorKind[] = [
      'invalid_input', 'validation', 'unauthorized', 'forbidden', 'not_found',
      'conflict', 'config', 'external_service', 'internal',
    ];
    for (const k of kinds) expect(STATUS_BY_KIND[k]).toBeGreaterThanOrEqual(400);
  });
});
