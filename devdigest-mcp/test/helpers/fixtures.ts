// Hermetic fixtures shaped like the DevDigest wire contracts + MCP test plumbing.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { DevDigestApi } from '../../src/domain/ports.js';
import { createMcpServer } from '../../src/server.js';
import { withHealthGate } from '../../src/services/health-gate.js';

export const BASE = 'http://127.0.0.1:3001';
export const REPO_ID = 'repo-1';
export const PR_ID = 'pr-1';
export const RUN_ID = '33333333-3333-4333-8333-333333333333';
export const AGENT_ID = '11111111-1111-4111-8111-111111111111';

export function repoFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: REPO_ID,
    workspace_id: 'ws',
    owner: 'acme',
    name: 'api',
    full_name: 'acme/api',
    default_branch: 'main',
    clone_path: null,
    last_polled_at: null,
    created_by: null,
    ...over,
  };
}

export function prFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PR_ID,
    number: 42,
    title: 'Add thing',
    author: 'bob',
    branch: 'feat',
    base: 'main',
    head_sha: 'abc',
    additions: 1,
    deletions: 0,
    files_count: 1,
    status: 'open',
    ...over,
  };
}

export function findingFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'f-1',
    severity: 'WARNING',
    category: 'bug',
    title: 'A finding',
    file: 'src/a.ts',
    start_line: 1,
    end_line: 2,
    rationale: 'because',
    suggestion: null,
    confidence: 0.9,
    review_id: 'rev-1',
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

export function reviewFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'rev-1',
    pr_id: PR_ID,
    agent_id: AGENT_ID,
    run_id: RUN_ID,
    agent_name: 'Security reviewer',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'Summary text',
    score: 70,
    model: 'cheap/model',
    grounding: null,
    created_at: '2026-10-01T00:00:00Z',
    findings: [findingFixture()],
    ...over,
  };
}

export function runFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: RUN_ID,
    agent_id: AGENT_ID,
    agent_name: 'Security reviewer',
    provider: 'openrouter',
    model: 'cheap/model',
    status: 'done',
    error: null,
    duration_ms: 1000,
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: 0.001,
    findings_count: 1,
    grounding: null,
    ran_at: null,
    score: 70,
    blockers: 0,
    critical_count: 0,
    warning_count: 1,
    suggestion_count: 0,
    ...over,
  };
}

export function conventionFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c-1',
    rule: 'Use camelCase',
    evidence_path: 'src/x.ts',
    evidence_snippet: 'const fooBar = 1',
    evidence_line: 3,
    category: 'naming',
    confidence: 0.8,
    accepted: true,
    ...over,
  };
}

export function fakePort(over: Partial<DevDigestApi>): DevDigestApi {
  const nope = (): never => {
    throw new Error('unexpected port call');
  };
  return {
    health: async () => undefined,
    listAgents: nope,
    listRepos: nope,
    listPulls: nope,
    listConventions: nope,
    startReview: nope,
    listRuns: nope,
    listReviews: nope,
    getBlast: nope,
    waitForRunEnd: nope,
    ...over,
  };
}

const clients: Client[] = [];

export async function connectClient(api: DevDigestApi, runTimeoutMs?: number): Promise<Client> {
  const server = createMcpServer({
    api: withHealthGate(api),
    baseUrl: BASE,
    ...(runTimeoutMs !== undefined ? { runTimeoutMs } : {}),
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  clients.push(client);
  return client;
}

export async function closeClients(): Promise<void> {
  await Promise.all(clients.splice(0).map((c) => c.close()));
}

export function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = result.content as { type: string; text: string }[];
  return content[0]?.text ?? '';
}
