import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ApiAgent, ApiFinding, ApiRepo, ApiReview, ApiRun, ApiConvention } from '../../src/api-client.js';
import type { Config } from '../../src/config.js';
import { createServer } from '../../src/server.js';

export const BASE = 'http://devdigest.test';
export const REPO: ApiRepo = { id: 'repo-1', owner: 'acme', name: 'payments-api', full_name: 'acme/payments-api' };
export const PR_ID = 'pr-uuid-3';
export const SECURITY: ApiAgent = {
  id: 'agent-sec',
  name: 'Security Reviewer',
  description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
  enabled: true,
};
export const STYLE: ApiAgent = { id: 'agent-style', name: 'Style Reviewer', description: 'Naming and style.', enabled: false };

export function finding(severity: string, i = 0, extra: Partial<ApiFinding> = {}): ApiFinding {
  return {
    severity,
    title: `${severity} issue ${i}`,
    file: `src/f${i}.ts`,
    start_line: 10 + i,
    rationale: `Why ${severity} ${i} matters.`,
    dismissed_at: null,
    ...extra,
  };
}

/** In-memory DevDigest API state; tests mutate it before calling tools. */
export interface FakeState {
  agents: ApiAgent[];
  repos: ApiRepo[];
  pulls: { id: string; number: number; title: string }[];
  runs: ApiRun[];
  reviews: ApiReview[];
  conventions: ApiConvention[];
  /** Statuses the started run reports on successive GET /runs polls (last one sticks). */
  runStatusSequence: string[];
  /** Findings attached to the review created when the started run reaches `done`. */
  newRunFindings: ApiFinding[];
  reviewStatus?: number; // force POST /review to answer this status (e.g. 429, 404)
  /** Id of the run whose status follows `runStatusSequence` (default 'run-new'; set it for a pre-seeded running run). */
  trackedRunId?: string;
  /** Called with every request as "METHOD /path" (before it is answered). */
  onCall?: (call: string) => void;
  unreachable?: boolean;
  calls: string[];
}

export function freshState(): FakeState {
  return {
    agents: [SECURITY, STYLE],
    repos: [REPO, { id: 'repo-2', owner: 'lindigo', name: 'dev-digest', full_name: 'lindigo/dev-digest' }],
    pulls: [{ id: PR_ID, number: 3, title: 'Add payments webhook' }],
    runs: [],
    reviews: [],
    conventions: [],
    runStatusSequence: ['running', 'done'],
    newRunFindings: [],
    calls: [],
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export function fakeFetch(state: FakeState) {
  let polls = 0;
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';
    const path = url.replace(BASE, '');
    state.calls.push(`${method} ${path}`);
    state.onCall?.(`${method} ${path}`);
    if (state.unreachable) throw new TypeError('fetch failed');

    if (method === 'GET' && path === '/agents') return json(state.agents);
    if (method === 'GET' && path === '/repos') return json(state.repos);
    let m = path.match(/^\/repos\/([^/]+)\/pulls$/);
    if (method === 'GET' && m) return json(m[1] === REPO.id ? state.pulls : []);
    m = path.match(/^\/repos\/([^/]+)\/conventions$/);
    if (method === 'GET' && m) return json(state.conventions);

    m = path.match(/^\/pulls\/([^/]+)\/review$/);
    if (method === 'POST' && m) {
      if (state.reviewStatus === 429) {
        return json({ error: { code: 'rate_limited', message: 'Too many requests' } }, 429, { 'retry-after': '42' });
      }
      if (state.reviewStatus !== undefined) {
        return json({ error: { code: 'not_found', message: 'Pull request not found' } }, state.reviewStatus);
      }
      const { agentId } = JSON.parse(String(init?.body)) as { agentId: string };
      const agent = state.agents.find((a) => a.id === agentId)!;
      const run: ApiRun = { run_id: 'run-new', agent_id: agentId, agent_name: agent.name, status: 'running', error: null, ran_at: null };
      state.runs.unshift(run);
      return json({ pr_id: m[1], runs: [{ run_id: run.run_id, agent_id: agentId, agent_name: agent.name }], reviews: [] });
    }
    m = path.match(/^\/pulls\/([^/]+)\/runs$/);
    if (method === 'GET' && m) {
      const trackedId = state.trackedRunId ?? 'run-new';
      const started = state.runs.find((r) => r.run_id === trackedId);
      if (started && started.status === 'running') {
        const seq = state.runStatusSequence;
        const next = seq[Math.min(polls, seq.length - 1)]!;
        polls++;
        started.status = next;
        if (next === 'failed') started.error = 'OpenRouter 402: requires more credits';
        if (next === 'done') {
          state.reviews.unshift({
            run_id: trackedId,
            agent_id: started.agent_id,
            agent_name: started.agent_name,
            kind: 'review',
            verdict: state.newRunFindings.length ? 'request_changes' : 'approve',
            summary: 'Review summary.',
            score: state.newRunFindings.length ? 40 : 95,
            findings: state.newRunFindings,
          });
        }
      }
      return json(state.runs);
    }
    m = path.match(/^\/pulls\/([^/]+)\/reviews$/);
    if (method === 'GET' && m) return json(state.reviews);

    return json({ error: { code: 'not_found', message: `No route ${method} ${path}` } }, 404);
  };
}

export const TEST_CONFIG: Config = { apiUrl: BASE, runTimeoutMs: 2_000, pollMs: 1 };

export async function connect(state: FakeState, config: Partial<Config> = {}) {
  const server = createServer({ ...TEST_CONFIG, ...config }, fakeFetch(state));
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  // Record every JSON-RPC method the server sends (the client SDK swallows malformed progress notifications).
  const serverSent: string[] = [];
  const originalSend = serverT.send.bind(serverT);
  serverT.send = (message, options) => {
    if ('method' in message) serverSent.push(message.method);
    return originalSend(message, options);
  };
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  const call = (name: string, args: Record<string, unknown> = {}) =>
    client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
  return { client, call, serverSent, close: () => client.close() };
}

export function text(r: CallToolResult): string {
  return r.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
}
