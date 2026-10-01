import { afterEach, describe, expect, it } from 'vitest';
import { DevDigestClient } from '../../src/adapters/devdigest-client.js';
import { apiErrorMessage } from '../../src/domain/errors.js';
import { ApiError } from '../../src/domain/ports.js';
import { agentFixture, closedPortUrl, startFakeApi, type FakeApi } from '../helpers/fake-api.js';

let api: FakeApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

function client(baseUrl: string, httpTimeoutMs = 5000): DevDigestClient {
  return new DevDigestClient({ baseUrl, httpTimeoutMs });
}

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('expected the call to fail');
}

const SECRET = 'SECRET_DETAIL_do_not_leak';

describe('DevDigestClient', () => {
  it('200: parses agents and health', async () => {
    api = await startFakeApi({
      'GET /health': { body: { status: 'ok' } },
      'GET /agents': { body: [agentFixture()] },
    });
    const c = client(api.baseUrl);
    await expect(c.health()).resolves.toBeUndefined();
    const agents = await c.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]?.name).toBe('Security reviewer');
  });

  it('400 and 422 map to invalid_input; details never reach any message', async () => {
    api = await startFakeApi({
      'GET /agents': {
        status: 422,
        body: { error: { code: 'validation_error', message: 'Request validation failed', details: [SECRET] } },
      },
      'GET /repos': { status: 400, body: { error: { code: 'bad_request', message: SECRET } } },
    });
    for (const call of [() => client(api!.baseUrl).listAgents(), () => client(api!.baseUrl).listRepos()]) {
      const err = await failure(call());
      expect(err.kind).toBe('invalid_input');
      const text = `${err.message} ${apiErrorMessage(err, { baseUrl: api.baseUrl, tool: 't' })} ${JSON.stringify(err)}`;
      expect(text).not.toContain(SECRET);
    }
    const e422 = await failure(client(api.baseUrl).listAgents());
    expect(e422.code).toBe('validation_error');
    expect(apiErrorMessage(e422, { baseUrl: api.baseUrl, tool: 't' })).toContain('validation_error');
  });

  it('404 maps to not_found and uses the contextual message when given', async () => {
    api = await startFakeApi(); // every route 404s
    const err = await failure(client(api.baseUrl).listAgents());
    expect(err.kind).toBe('not_found');
    expect(apiErrorMessage(err, { baseUrl: api.baseUrl, tool: 't', notFound: 'Agent "x" was not found.' })).toBe(
      'Agent "x" was not found.',
    );
  });

  it('409 maps to conflict and surfaces only the truncated server message', async () => {
    api = await startFakeApi({
      'GET /agents': { status: 409, body: { error: { code: 'conflict', message: 'x'.repeat(500), details: SECRET } } },
    });
    const err = await failure(client(api.baseUrl).listAgents());
    expect(err.kind).toBe('conflict');
    const msg = apiErrorMessage(err, { baseUrl: api.baseUrl, tool: 't' });
    expect(msg).toContain('conflict');
    expect(msg.length).toBeLessThan(400);
    expect(msg).not.toContain(SECRET);
  });

  it('429 maps to rate_limited and names the tool', async () => {
    api = await startFakeApi({ 'GET /agents': { status: 429, body: { error: { code: 'rate', message: 'slow' } } } });
    const err = await failure(client(api.baseUrl).listAgents());
    expect(err.kind).toBe('rate_limited');
    expect(apiErrorMessage(err, { baseUrl: api.baseUrl, tool: 'run_agent_on_pr' })).toContain('run_agent_on_pr');
  });

  it('500 maps to server; body, stack and details are not exposed', async () => {
    api = await startFakeApi({
      'GET /agents': {
        status: 500,
        body: { error: { code: 'internal_error', message: SECRET, details: `Error: boom\n    at ${SECRET} (file.ts:1:1)` } },
      },
    });
    const err = await failure(client(api.baseUrl).listAgents());
    expect(err.kind).toBe('server');
    expect(err.status).toBe(500);
    const text = `${err.message} ${err.stack ?? ''} ${apiErrorMessage(err, { baseUrl: api.baseUrl, tool: 't' })}`;
    expect(text).not.toContain(SECRET);
    expect(apiErrorMessage(err, { baseUrl: api.baseUrl, tool: 't' })).toContain('db:migrate');
  });

  it('HTML response (the Next.js web UI) maps to not_api, on 200 and on error statuses', async () => {
    api = await startFakeApi({
      'GET /agents': { body: '<!DOCTYPE html><html>Next.js</html>', headers: { 'content-type': 'text/html; charset=utf-8' } },
      'GET /repos': { status: 404, body: '<html>404</html>', headers: { 'content-type': 'text/html' } },
      'GET /health': { body: 'ok' }, // text/plain 200 is not JSON either
    });
    for (const call of [() => client(api!.baseUrl).listAgents(), () => client(api!.baseUrl).listRepos(), () => client(api!.baseUrl).health()]) {
      expect((await failure(call())).kind).toBe('not_api');
    }
    const msg = apiErrorMessage(await failure(client(api.baseUrl).listAgents()), { baseUrl: api.baseUrl, tool: 't' });
    expect(msg).toContain('web UI');
    expect(msg).toContain(api.baseUrl);
  });

  it('closed port maps to unreachable', async () => {
    const url = await closedPortUrl();
    const err = await failure(client(url).listAgents());
    expect(err.kind).toBe('unreachable');
    expect(apiErrorMessage(err, { baseUrl: url, tool: 't' })).toContain('./scripts/dev.sh');
  });

  it('schema mismatch maps to contract (and the offending body is not echoed)', async () => {
    api = await startFakeApi({ 'GET /agents': { body: [{ id: 42, name: SECRET }] } });
    const err = await failure(client(api.baseUrl).listAgents());
    expect(err.kind).toBe('contract');
    expect(`${err.message} ${apiErrorMessage(err, { baseUrl: api.baseUrl, tool: 't' })}`).not.toContain(SECRET);
  });

  it('health with a wrong body is a contract error', async () => {
    api = await startFakeApi({ 'GET /health': { body: { status: 'nope' } } });
    expect((await failure(client(api.baseUrl).health())).kind).toBe('contract');
  });

  it('does not follow redirects (redirect: error)', async () => {
    api = await startFakeApi({
      'GET /agents': { status: 302, headers: { location: '/elsewhere' }, body: '' },
      'GET /elsewhere': { body: [] },
    });
    const err = await failure(client(api.baseUrl).listAgents());
    expect(err.kind).toBe('not_api');
    expect(api.requests).not.toContain('GET /elsewhere');
  });

  it('percent-encodes path segments', async () => {
    api = await startFakeApi();
    await failure(client(api.baseUrl).listPulls('a/b?c'));
    expect(api.requests).toEqual(['GET /repos/a%2Fb%3Fc/pulls']);
  });

  it('a request that exceeds the HTTP timeout maps to unreachable', async () => {
    api = await startFakeApi({ 'GET /agents': { stream: () => undefined } }); // never answers
    const err = await failure(client(api.baseUrl, 1000).listAgents());
    expect(err.kind).toBe('unreachable');
  }, 10_000);

  it('waitForRunEnd: resolves "closed" when the stream ends, forwards events', async () => {
    api = await startFakeApi({
      'GET /runs/r1/events': {
        stream: (res) => {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.write(`event: info\ndata: ${JSON.stringify({ kind: 'info', message: 'hello' })}\n\n`);
          res.end();
        },
      },
    });
    const seen: string[] = [];
    const out = await client(api.baseUrl).waitForRunEnd('r1', new AbortController().signal, (e) =>
      seen.push(`${e.kind}:${e.message}`),
    );
    expect(out.outcome).toBe('closed');
    expect(seen).toEqual(['info:hello']);
  });

  it('waitForRunEnd: resolves "aborted" when the signal fires first, and never calls cancel', async () => {
    api = await startFakeApi({
      'GET /runs/r2/events': { stream: (res) => void res.writeHead(200, { 'content-type': 'text/event-stream' }).flushHeaders() },
    });
    const out = await client(api.baseUrl).waitForRunEnd('r2', AbortSignal.timeout(100));
    expect(out.outcome).toBe('aborted');
    expect(api.requests.some((r) => r.includes('/cancel'))).toBe(false);
  });
});
