import { describe, expect, it, vi } from 'vitest';
import { DevDigestHttpClient } from '../../src/http/client.js';
import { DevDigestApiError, DevDigestNetworkError, DevDigestTimeoutError } from '../../src/http/errors.js';

/** Builds a fake `fetch` (this repo's DI test-double convention — no
 *  module-level mocking) that returns a canned Response for every call. */
function fakeFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => impl(String(url), init));
}

describe('DevDigestHttpClient', () => {
  it('GETs JSON from baseUrl + path', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url).toBe('http://localhost:3001/agents');
      return new Response(JSON.stringify([{ id: '1' }]), { status: 200 });
    });
    const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    const result = await client.get<{ id: string }[]>('/agents');
    expect(result).toEqual([{ id: '1' }]);
  });

  it('strips a trailing slash from baseUrl', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url).toBe('http://localhost:3001/agents');
      return new Response('[]', { status: 200 });
    });
    const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001/', fetchImpl });
    await client.get('/agents');
  });

  it('POSTs a JSON body with Content-Type', async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url).toBe('http://localhost:3001/pulls/pr-1/review');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
      expect(init?.body).toBe(JSON.stringify({ agentId: 'agent-1' }));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    const result = await client.post('/pulls/pr-1/review', { agentId: 'agent-1' });
    expect(result).toEqual({ ok: true });
  });

  it('throws DevDigestApiError with status/code/message from the error envelope', async () => {
    const fetchImpl = fakeFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 'not_found', message: 'Agent not found' } }), {
          status: 404,
        }),
    );
    const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    await expect(client.get('/agents/missing')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Agent not found',
    });
  });

  it('is a DevDigestApiError instance on non-ok response', async () => {
    const fetchImpl = fakeFetch(() => new Response('{}', { status: 500 }));
    const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    await expect(client.get('/agents')).rejects.toBeInstanceOf(DevDigestApiError);
  });

  it('regression: detects a 429 by HTTP status even when error.code is mislabeled internal_error', async () => {
    // Confirmed bug in server/src/app.ts's setErrorHandler: @fastify/rate-limit's
    // 429 falls through the generic catch-all, which sets error.code to
    // "internal_error". Callers must branch on `status`, never `code`.
    const fetchImpl = fakeFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 'internal_error', message: 'Rate limit exceeded' } }), {
          status: 429,
        }),
    );
    const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    await expect(client.post('/pulls/pr-1/review', {})).rejects.toMatchObject({
      status: 429,
      code: 'internal_error',
    });
  });

  it('wraps a fetch() rejection as DevDigestNetworkError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    await expect(client.get('/agents')).rejects.toBeInstanceOf(DevDigestNetworkError);
  });

  it('falls back to statusText when the error body is not JSON', async () => {
    const fetchImpl = fakeFetch(() => new Response('not json', { status: 502, statusText: 'Bad Gateway' }));
    const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    await expect(client.get('/agents')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
  });

  it('throws DevDigestTimeoutError when the per-call timeout elapses', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('This operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    await expect(client.get('/agents', 5)).rejects.toBeInstanceOf(DevDigestTimeoutError);
  });

  describe('openEventStream', () => {
    it('returns the response body stream on success', async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {}\n\n'));
          controller.close();
        },
      });
      const fetchImpl = fakeFetch((url, init) => {
        expect(url).toBe('http://localhost:3001/runs/run-1/events');
        expect(init?.headers).toMatchObject({ Accept: 'text/event-stream' });
        return new Response(body, { status: 200 });
      });
      const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
      const controller = new AbortController();
      const stream = await client.openEventStream('/runs/run-1/events', controller.signal);
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it('rethrows an AbortError as-is so the caller can inspect signal.aborted', async () => {
      const controller = new AbortController();
      const fetchImpl = vi.fn(async () => {
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        throw err;
      });
      const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
      controller.abort();
      await expect(client.openEventStream('/runs/run-1/events', controller.signal)).rejects.toThrow(
        /aborted/,
      );
    });

    it('throws DevDigestApiError on a non-ok response', async () => {
      const fetchImpl = fakeFetch(
        () => new Response(JSON.stringify({ error: { code: 'not_found', message: 'Run not found' } }), { status: 404 }),
      );
      const client = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
      const controller = new AbortController();
      await expect(client.openEventStream('/runs/missing/events', controller.signal)).rejects.toBeInstanceOf(
        DevDigestApiError,
      );
    });
  });
});
