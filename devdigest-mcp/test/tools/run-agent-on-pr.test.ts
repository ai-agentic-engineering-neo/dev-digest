import type http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { DevDigestClient } from '../../src/adapters/devdigest-client.js';
import { startFakeApi, agentFixture, type FakeApi } from '../helpers/fake-api.js';
import {
  AGENT_ID,
  closeClients,
  connectClient,
  PR_ID,
  prFixture,
  repoFixture,
  reviewFixture,
  REPO_ID,
  RUN_ID,
  runFixture,
  textOf,
} from '../helpers/fixtures.js';

const apis: FakeApi[] = [];
afterEach(async () => {
  await closeClients();
  await Promise.all(apis.splice(0).map((a) => a.close()));
});

const SSE_HEADERS = { 'content-type': 'text/event-stream' };
function closingStream(res: http.ServerResponse): void {
  res.writeHead(200, SSE_HEADERS);
  res.write('event: info\ndata: {"message":"reading diff"}\n\n');
  res.write('event: tool\ndata: {"message":"search"}\n\n');
  res.end();
}
function heldOpenStream(res: http.ServerResponse): void {
  res.writeHead(200, SSE_HEADERS);
  res.write('event: info\ndata: {"message":"working"}\n\n');
  // never ends: the client must give up on its own deadline
}

async function setup(opts: {
  runStatus?: Record<string, unknown>;
  stream?: (res: http.ServerResponse) => void;
  reviews?: unknown[];
  agents?: Record<string, unknown>[];
  runTimeoutMs?: number;
  extra?: Record<string, { status?: number; body?: unknown }>;
}) {
  const api = await startFakeApi({
    'GET /health': { body: { status: 'ok' } },
    'GET /repos': { body: [repoFixture()] },
    [`GET /repos/${REPO_ID}/pulls`]: { body: [prFixture()] },
    'GET /agents': { body: opts.agents ?? [agentFixture()] },
    [`POST /pulls/${PR_ID}/review`]: {
      body: {
        pr_id: PR_ID,
        runs: [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'Security reviewer' }],
        reviews: [],
      },
    },
    [`GET /runs/${RUN_ID}/events`]: { stream: opts.stream ?? closingStream },
    [`GET /pulls/${PR_ID}/runs`]: { body: [runFixture(opts.runStatus ?? {})] },
    [`GET /pulls/${PR_ID}/reviews`]: { body: opts.reviews ?? [reviewFixture()] },
    ...opts.extra,
  });
  apis.push(api);
  const client = await connectClient(
    new DevDigestClient({ baseUrl: api.baseUrl, httpTimeoutMs: 5000 }),
    opts.runTimeoutMs,
  );
  return { api, client };
}
const args = { repo: 'acme/api', pr: 42, agent: AGENT_ID };
const run = (client: Awaited<ReturnType<typeof setup>>['client'], a: Record<string, unknown> = args) =>
  client.callTool({ name: 'run_agent_on_pr', arguments: a });

describe('run_agent_on_pr tool', () => {
  it('registers verbatim as the only non-read-only tool', async () => {
    const { client } = await setup({});
    const tool = (await client.listTools()).tools.find((t) => t.name === 'run_agent_on_pr')!;
    expect(tool.description).toBe(
      'Run a review agent on a pull request and return its findings once the run finishes (up to ~2 minutes).',
    );
    expect(tool.annotations).toEqual({
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });
  });

  it('stream closes + done: returns findings and forwards progress; never cancels', async () => {
    const { api, client } = await setup({});
    const progress: string[] = [];
    const res = await client.callTool({ name: 'run_agent_on_pr', arguments: args }, undefined, {
      onprogress: (p) => progress.push(p.message ?? ''),
    });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(textOf(res))).toMatchObject({ run_id: RUN_ID, verdict: 'request_changes', total: 1 });
    expect(progress.some((m) => m.includes(RUN_ID))).toBe(true);
    expect(progress.some((m) => m.includes('reading diff'))).toBe(true);
    expect(api.requests.some((r) => r.includes('/cancel'))).toBe(false);
  });

  it('stream closes + failed / cancelled: error from the run row, with next step', async () => {
    const failed = await (await setup({ runStatus: { status: 'failed', error: 'LLM exploded' } })).client;
    const f = await run(failed);
    expect(f.isError).toBe(true);
    expect(textOf(f)).toContain(`Run "${RUN_ID}" failed: LLM exploded`);

    const cancelled = await (await setup({ runStatus: { status: 'cancelled' } })).client;
    const c = await run(cancelled);
    expect(c.isError).toBe(true);
    expect(textOf(c)).toContain('was cancelled');
  });

  it('done but no persisted review: tells the caller to use get_findings later', async () => {
    const { client } = await setup({ reviews: [] });
    const res = await run(client);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain(`get_findings(repo="acme/api", pr=42, run_id="${RUN_ID}")`);
  });

  it('timeout: stream held open -> run left running, run_id in message, POST cancel never called', async () => {
    const { api, client } = await setup({ stream: heldOpenStream, runTimeoutMs: 100 });
    const started = Date.now();
    const res = await run(client);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(res.isError).toBe(true);
    const text = textOf(res);
    expect(text).toContain(RUN_ID);
    expect(text).toContain('left running (not cancelled)');
    expect(text).toContain(`get_findings(repo="acme/api", pr=42, run_id="${RUN_ID}")`);
    expect(api.requests.filter((r) => r.includes('cancel'))).toEqual([]);
    expect(api.requests).toContain(`POST /pulls/${PR_ID}/review`);
  });

  it('stream drops while the run row still says running: same left-running path', async () => {
    const { api, client } = await setup({ runStatus: { status: 'running' } });
    const res = await run(client);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain(RUN_ID);
    expect(textOf(res)).toContain('not cancelled');
    expect(api.requests.some((r) => r.includes('cancel'))).toBe(false);
  });

  it('disabled or unknown agent is rejected before the POST', async () => {
    const { api, client } = await setup({ agents: [agentFixture({ enabled: false })] });
    const res = await run(client);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('Call list_agents');
    expect(api.requests).not.toContain(`POST /pulls/${PR_ID}/review`);

    const unknown = await run(client, { ...args, agent: '99999999-9999-4999-8999-999999999999' });
    expect(textOf(unknown)).toContain('was not found (or is disabled)');
    expect(api.requests).not.toContain(`POST /pulls/${PR_ID}/review`);
  });

  it('a non-uuid agent never reaches the API', async () => {
    const { api, client } = await setup({});
    const res = await run(client, { ...args, agent: 'not-a-uuid' });
    expect(res.isError).toBe(true);
    expect(api.requests.filter((r) => r.startsWith('POST') || r === 'GET /agents')).toEqual([]);
  });

  it('429 on POST maps to the rate-limit message and starts no stream', async () => {
    const { api, client } = await setup({
      extra: { [`POST /pulls/${PR_ID}/review`]: { status: 429, body: { error: { code: 'rate_limited', message: 'slow' } } } },
    });
    const res = await run(client);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('rate limit');
    expect(textOf(res)).toContain('run_agent_on_pr');
    expect(api.requests.some((r) => r.includes('/events'))).toBe(false);
  });
});
