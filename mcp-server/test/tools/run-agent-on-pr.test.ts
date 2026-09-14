import { describe, expect, it, vi } from 'vitest';
import { DevDigestHttpClient } from '../../src/http/client.js';
import { runAgentOnPrInputSchema, makeRunAgentOnPrHandler } from '../../src/tools/run-agent-on-pr.js';

const REPOS = [{ id: 'repo-1', owner: 'acme', name: 'widgets', full_name: 'acme/widgets' }];
const PULLS = [{ id: 'pr-1', number: 5, title: 'Add feature' }];
const RUN_TARGET = { run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Bug Hunter' };
const REVIEW_RECORD = {
  run_id: 'run-1',
  agent_id: 'agent-1',
  agent_name: 'Bug Hunter',
  verdict: 'approve',
  summary: 'Looks fine',
  score: 90,
  findings: [],
};

function sseFrame(event: { runId: string; seq: number; kind: string; msg: string; t: string }): string {
  return `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** A stream that enqueues the given frames then closes — the normal
 *  "SSE closed = run complete" path. */
function closingStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= frames.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(frames[i]));
      i += 1;
    },
  });
}

/** A stream whose reads never resolve until `signal` aborts, at which point
 *  they reject with an AbortError — simulating a run that never finishes
 *  within the wait budget. */
function hangingStream(signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull() {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('This operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    },
  });
}

interface Routes {
  repos?: unknown;
  pulls?: unknown;
  postReview?: { status: number; body: unknown };
  sse?: 'closing' | 'hanging';
  sseFrames?: string[];
  runs?: unknown;
  reviews?: unknown;
}

function buildClient(routes: Routes) {
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace('http://localhost:3001', '');
    if (path === '/repos') return new Response(JSON.stringify(routes.repos ?? REPOS), { status: 200 });
    if (path === '/repos/repo-1/pulls') return new Response(JSON.stringify(routes.pulls ?? PULLS), { status: 200 });
    if (path === '/pulls/pr-1/review' && init?.method === 'POST') {
      const r = routes.postReview ?? { status: 200, body: { pr_id: 'pr-1', runs: [RUN_TARGET], reviews: [] } };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }
    if (path === '/runs/run-1/events') {
      if (routes.sse === 'hanging') return new Response(hangingStream(init!.signal as AbortSignal), { status: 200 });
      const frames = routes.sseFrames ?? [
        sseFrame({ runId: 'run-1', seq: 1, kind: 'info', msg: 'starting', t: '00.01' }),
        sseFrame({ runId: 'run-1', seq: 2, kind: 'result', msg: 'done', t: '00.02' }),
      ];
      return new Response(closingStream(frames), { status: 200 });
    }
    if (path === '/pulls/pr-1/runs') return new Response(JSON.stringify(routes.runs ?? []), { status: 200 });
    if (path === '/pulls/pr-1/reviews') return new Response(JSON.stringify(routes.reviews ?? []), { status: 200 });
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 });
  });
  return { http: new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl }), fetchImpl };
}

function text(result: { content: unknown }) {
  return (result.content as { type: 'text'; text: string }[])[0]!.text;
}

describe('run_agent_on_pr input schema', () => {
  it('requires repo, positive int pr, and agent', () => {
    expect(runAgentOnPrInputSchema.safeParse({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' }).success).toBe(true);
    expect(runAgentOnPrInputSchema.safeParse({ repo: '', pr: 5, agent: 'agent-1' }).success).toBe(false);
    expect(runAgentOnPrInputSchema.safeParse({ repo: 'acme/widgets', pr: 0, agent: 'agent-1' }).success).toBe(false);
    expect(runAgentOnPrInputSchema.safeParse({ repo: 'acme/widgets', pr: 5.5, agent: 'agent-1' }).success).toBe(false);
    expect(runAgentOnPrInputSchema.safeParse({ repo: 'acme/widgets', pr: 5, agent: '' }).success).toBe(false);
  });
});

describe('run_agent_on_pr handler', () => {
  it('runs the full chain: POST -> SSE close -> status done -> matching review -> success', async () => {
    const { http } = buildClient({
      runs: [{ run_id: 'run-1', status: 'done', error: null }],
      reviews: [REVIEW_RECORD],
    });
    const handler = makeRunAgentOnPrHandler({ http, apiBaseUrl: 'http://localhost:3001' });
    const result = await handler({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(text(result))).toEqual({
      run_id: 'run-1',
      agent_id: 'agent-1',
      agent_name: 'Bug Hunter',
      verdict: 'approve',
      summary: 'Looks fine',
      score: 90,
      findings: [],
    });
  });

  it('matches the review by exact run_id, not "latest for this agent"', async () => {
    const otherRunReview = { ...REVIEW_RECORD, run_id: 'run-OTHER', score: 10 };
    const { http } = buildClient({
      runs: [{ run_id: 'run-1', status: 'done', error: null }],
      reviews: [otherRunReview, REVIEW_RECORD],
    });
    const handler = makeRunAgentOnPrHandler({ http, apiBaseUrl: 'http://localhost:3001' });
    const result = await handler({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' });
    expect(JSON.parse(text(result)).run_id).toBe('run-1');
    expect(JSON.parse(text(result)).score).toBe(90);
  });

  it('sends notifications/progress for each SSE event when a progressToken is supplied', async () => {
    const { http } = buildClient({
      runs: [{ run_id: 'run-1', status: 'done', error: null }],
      reviews: [REVIEW_RECORD],
    });
    const sendNotification = vi.fn(async () => {});
    const handler = makeRunAgentOnPrHandler({ http, apiBaseUrl: 'http://localhost:3001' });
    await handler({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' }, { _meta: { progressToken: 'tok-1' }, sendNotification });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenNthCalledWith(1, {
      method: 'notifications/progress',
      params: { progressToken: 'tok-1', progress: 1, message: 'starting' },
    });
    expect(sendNotification).toHaveBeenNthCalledWith(2, {
      method: 'notifications/progress',
      params: { progressToken: 'tok-1', progress: 2, message: 'done' },
    });
  });

  it('skips notifications when no progressToken was supplied, but still consumes the stream', async () => {
    const { http } = buildClient({
      runs: [{ run_id: 'run-1', status: 'done', error: null }],
      reviews: [REVIEW_RECORD],
    });
    const sendNotification = vi.fn(async () => {});
    const handler = makeRunAgentOnPrHandler({ http, apiBaseUrl: 'http://localhost:3001' });
    const result = await handler({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' }, { sendNotification });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
  });

  it('regression: detects 429 by HTTP status even when error.code is mislabeled internal_error', async () => {
    const { http } = buildClient({
      postReview: { status: 429, body: { error: { code: 'internal_error', message: 'Rate limit exceeded' } } },
    });
    const handler = makeRunAgentOnPrHandler({ http, apiBaseUrl: 'http://localhost:3001' });
    const result = await handler({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Rate limited');
  });

  it('maps a 404/not_found POST response to "agent not found"', async () => {
    const { http } = buildClient({
      postReview: { status: 404, body: { error: { code: 'not_found', message: 'Agent not found' } } },
    });
    const handler = makeRunAgentOnPrHandler({ http, apiBaseUrl: 'http://localhost:3001' });
    const result = await handler({ repo: 'acme/widgets', pr: 5, agent: 'ghost' });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Agent 'ghost' not found. Call list_agents to see valid agent ids.");
  });

  it('maps status "failed" to a forward-leading error including run.error', async () => {
    const { http } = buildClient({
      runs: [{ run_id: 'run-1', status: 'failed', error: 'Missing ANTHROPIC_API_KEY' }],
    });
    const handler = makeRunAgentOnPrHandler({ http, apiBaseUrl: 'http://localhost:3001' });
    const result = await handler({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Agent run failed: Missing ANTHROPIC_API_KEY');
    expect(text(result)).toContain('missing API key');
  });

  it('maps status "cancelled" to a forward-leading retry message', async () => {
    const { http } = buildClient({
      runs: [{ run_id: 'run-1', status: 'cancelled', error: null }],
    });
    const handler = makeRunAgentOnPrHandler({ http, apiBaseUrl: 'http://localhost:3001' });
    const result = await handler({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('was cancelled');
  });

  it('returns the timeout message when the wait budget is exhausted before SSE closes', async () => {
    const { http } = buildClient({ sse: 'hanging' });
    const handler = makeRunAgentOnPrHandler({ http, apiBaseUrl: 'http://localhost:3001', sseWaitBudgetMs: 20 });
    const result = await handler({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Timed out after 120s');
    expect(text(result)).toContain('get_findings');
  });

  it('returns the PR-not-found message with repo full_name', async () => {
    const { http } = buildClient({});
    const handler = makeRunAgentOnPrHandler({ http, apiBaseUrl: 'http://localhost:3001' });
    const result = await handler({ repo: 'acme/widgets', pr: 999, agent: 'agent-1' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('PR #999 not found in acme/widgets');
  });

  it('returns the repo-not-found message for an unknown repo', async () => {
    const { http } = buildClient({});
    const handler = makeRunAgentOnPrHandler({ http, apiBaseUrl: 'http://localhost:3001' });
    const result = await handler({ repo: 'nope', pr: 5, agent: 'agent-1' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Repo 'nope' not found");
  });
});
