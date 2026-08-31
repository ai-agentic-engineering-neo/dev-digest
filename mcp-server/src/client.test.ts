import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiCallError, FetchApiClient } from './client.js';

describe('FetchApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a well-formed ApiErrorBody into an ApiCallError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: 'not_found', message: 'Agent not found' } }), {
          status: 404,
        }),
      ),
    );
    const client = new FetchApiClient('http://localhost:3001');

    await expect(client.get('/agents/x')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Agent not found',
    });
  });

  it('falls back to a generic error when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 502 })));
    const client = new FetchApiClient('http://localhost:3001');

    await expect(client.get('/agents')).rejects.toMatchObject({
      status: 502,
      code: 'unknown_error',
    });
  });

  it('falls back to a generic error when the body is JSON but not an ApiErrorBody', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ oops: true }), { status: 500 })));
    const client = new FetchApiClient('http://localhost:3001');

    await expect(client.get('/agents')).rejects.toBeInstanceOf(ApiCallError);
  });

  it('resolves with the parsed JSON body on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const client = new FetchApiClient('http://localhost:3001');

    await expect(client.post('/pulls/1/review', { agentId: 'a' })).resolves.toEqual({ ok: true });
  });
});
