import { describe, it, expect } from 'vitest';
import { createApiClient } from '../src/api/client.js';
import type { ApiError } from '../src/api/client.js';
import { fakeFetch } from './helpers.js';

const make = (h: Parameters<typeof fakeFetch>[0]) =>
  createApiClient({ baseUrl: 'http://api.test', fetch: fakeFetch(h).fetch });

async function caught(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected rejection');
}

describe('api client', () => {
  it('returns parsed JSON on 2xx', async () => {
    const api = make(() => ({ body: { ok: 1 } }));
    expect(await api.get('/x')).toEqual({ ok: 1 });
  });

  it('sends a JSON body on post', async () => {
    const ff = fakeFetch(() => ({ body: {} }));
    await createApiClient({ baseUrl: 'http://api.test', fetch: ff.fetch }).post('/p', { agentId: 'a' });
    expect(ff.calls[0]).toEqual({ method: 'POST', path: '/p', body: { agentId: 'a' } });
  });

  it('maps the error envelope, keeping code and message', async () => {
    const api = make(() => ({ status: 500, body: { error: { code: 'boom', message: 'exploded' } } }));
    await expect(api.get('/x')).rejects.toMatchObject({ kind: 'api', status: 500, code: 'boom' });
  });

  it('maps 404, 422 and 429', async () => {
    const e404 = await caught(make(() => ({ status: 404, body: { error: { code: 'not_found', message: 'Run not found' } } })).get('/x'));
    expect(e404.message).toContain('Not found');
    const e422 = await caught(make(() => ({ status: 422, body: { error: { code: 'validation', message: 'bad id', details: [{ path: 'id' }] } } })).get('/x'));
    expect(e422.message).toMatch(/Invalid input: bad id.*path/);
    const e429 = await caught(make(() => ({ status: 429, headers: { 'retry-after': '7' }, body: { error: { code: 'rate', message: 'slow' } } })).get('/x'));
    expect(e429.message).toContain('retry in 7s');
    expect(e429.retryAfterS).toBe(7);
  });

  it('handles a non-JSON error body', async () => {
    const e = await caught(make(() => ({ status: 502, raw: '<html>bad gateway</html>' })).get('/x'));
    expect(e.message).toContain('HTTP 502');
    expect(e.message).toContain('bad gateway');
  });

  it('maps a refused connection to the dev.sh hint', async () => {
    const api = createApiClient({
      baseUrl: 'http://api.test',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    const e = await caught(api.get('/x'));
    expect(e.kind).toBe('unavailable');
    expect(e.message).toContain('./scripts/dev.sh');
  });
});

