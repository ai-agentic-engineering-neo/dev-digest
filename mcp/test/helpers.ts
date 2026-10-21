import type { McpConfig } from '../src/config.js';
import { createApiClient } from '../src/api/client.js';

export interface FakeReply {
  status?: number;
  body?: unknown;
  raw?: string;
  headers?: Record<string, string>;
}
export type Handler = (method: string, path: string, body: unknown) => FakeReply | undefined;

/** A fetch double: handler decides the reply per request; records every call. */
export function fakeFetch(handler: Handler) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const method = init?.method ?? 'GET';
    calls.push({ method, path: url.pathname, body });
    const r = handler(method, url.pathname, body);
    if (!r) return new Response(JSON.stringify({ error: { code: 'not_found', message: 'no route' } }), { status: 404 });
    return new Response(r.raw ?? JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: r.headers });
  }) as typeof globalThis.fetch;
  return { fetch: f, calls };
}

export const CONFIG: McpConfig = { apiUrl: 'http://api.test', maxWaitMs: 30_000, pollMs: 1_000 };

export function clientFor(handler: Handler) {
  const ff = fakeFetch(handler);
  return { api: createApiClient({ baseUrl: CONFIG.apiUrl, fetch: ff.fetch }), calls: ff.calls };
}

export function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

export const REPO = { id: 'repo-1', name: 'payments-api', full_name: 'acme/payments-api' };
export const PR_ID = '11111111-1111-4111-8111-111111111111';
export const RUN_ID = '22222222-2222-4222-8222-222222222222';
export const AGENT_ID = '33333333-3333-4333-8333-333333333333';

export function runSummary(status: string, over: Record<string, unknown> = {}) {
  return {
    run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'Security', provider: 'openai', model: 'gpt-4.1',
    status, error: null, duration_ms: 10, tokens_in: 1, tokens_out: 1, cost_usd: 0.01, findings_count: 2,
    grounding: '2/2', ran_at: null, score: 42, blockers: 1, ...over,
  };
}

export function finding(id: string, severity: string, confidence = 0.9) {
  return {
    id, severity, category: 'bug', title: `T-${id}`, file: 'src/a.ts', start_line: 11, end_line: 12,
    rationale: `RATIONALE-${id}`, suggestion: `SUGGEST-${id}`, confidence, kind: 'finding',
    review_id: 'rev-1', accepted_at: null, dismissed_at: null,
  };
}

export function runFindings(status: string, findings: unknown[] = [], over: Record<string, unknown> = {}) {
  return {
    run: runSummary(status, over),
    review: status === 'done'
      ? { id: 'rev-1', verdict: 'request_changes', summary: 'Hardcoded key.', score: 42 }
      : null,
    findings,
  };
}
