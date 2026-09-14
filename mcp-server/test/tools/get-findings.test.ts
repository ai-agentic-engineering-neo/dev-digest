import { describe, expect, it, vi } from 'vitest';
import { DevDigestHttpClient } from '../../src/http/client.js';
import { getFindingsInputSchema, makeGetFindingsHandler } from '../../src/tools/get-findings.js';

const REPOS = [{ id: 'repo-1', owner: 'acme', name: 'widgets', full_name: 'acme/widgets' }];
const PULLS = [{ id: 'pr-1', number: 5, title: 'Add feature' }];

function clientRouting(routes: Record<string, unknown>) {
  const fetchImpl = vi.fn(async (url: string | URL) => {
    const path = String(url).replace('http://localhost:3001', '');
    if (path in routes) return new Response(JSON.stringify(routes[path]), { status: 200 });
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 });
  });
  return new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
}

function text(result: { content: unknown }) {
  return (result.content as { type: 'text'; text: string }[])[0]!.text;
}

const REVIEW_A2_NEWER = {
  run_id: 'run-2',
  agent_id: 'agent-2',
  agent_name: 'Style Bot',
  verdict: 'approve',
  summary: 'Looks good',
  score: 95,
  findings: [],
};
const REVIEW_A1_OLDER = {
  run_id: 'run-1',
  agent_id: 'agent-1',
  agent_name: 'Bug Hunter',
  verdict: 'request_changes',
  summary: 'Found issues',
  score: 40,
  findings: [
    {
      severity: 'CRITICAL',
      category: 'bug',
      kind: 'finding',
      title: 'Null deref',
      file: 'src/a.ts',
      start_line: 10,
      end_line: 12,
      rationale: 'Can crash',
      suggestion: 'Add a null check',
      confidence: 0.8,
    },
  ],
};

describe('get_findings input schema', () => {
  it('requires repo, positive int pr, and agent', () => {
    expect(getFindingsInputSchema.safeParse({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' }).success).toBe(true);
    expect(getFindingsInputSchema.safeParse({ repo: 'acme/widgets', pr: 0, agent: 'agent-1' }).success).toBe(false);
    expect(getFindingsInputSchema.safeParse({ repo: 'acme/widgets', pr: 5, agent: '' }).success).toBe(false);
  });
});

describe('get_findings handler', () => {
  it('returns the newest matching review for the given agent (filtered in memory)', async () => {
    const http = clientRouting({
      '/repos': REPOS,
      '/repos/repo-1/pulls': PULLS,
      '/pulls/pr-1/reviews': [REVIEW_A2_NEWER, REVIEW_A1_OLDER],
    });
    const handler = makeGetFindingsHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(text(result));
    expect(parsed.run_id).toBe('run-1');
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toEqual({
      severity: 'CRITICAL',
      category: 'bug',
      kind: 'finding',
      title: 'Null deref',
      file: 'src/a.ts',
      start_line: 10,
      end_line: 12,
      rationale: 'Can crash',
      suggestion: 'Add a null check',
      confidence: 0.8,
    });
  });

  it('never calls POST /pulls/:id/review — pure read', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(init?.method ?? 'GET').toBe('GET');
      const path = String(url).replace('http://localhost:3001', '');
      const routes: Record<string, unknown> = {
        '/repos': REPOS,
        '/repos/repo-1/pulls': PULLS,
        '/pulls/pr-1/reviews': [REVIEW_A1_OLDER],
      };
      return new Response(JSON.stringify(routes[path] ?? []), { status: 200 });
    });
    const http = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    const handler = makeGetFindingsHandler(http, 'http://localhost:3001');
    await handler({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' });
    for (const call of fetchImpl.mock.calls) {
      expect(String(call[0])).not.toMatch(/\/review$/);
    }
  });

  it('returns "not found" for a completely unknown agent id', async () => {
    const http = clientRouting({
      '/repos': REPOS,
      '/repos/repo-1/pulls': PULLS,
      '/pulls/pr-1/reviews': [],
      '/agents': [{ id: 'agent-1', name: 'Bug Hunter' }],
    });
    const handler = makeGetFindingsHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'acme/widgets', pr: 5, agent: 'ghost-agent' });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Agent id 'ghost-agent' not found. Call list_agents to see valid agent ids.");
  });

  it('returns "has not reviewed this PR yet" for a known agent with no review', async () => {
    const http = clientRouting({
      '/repos': REPOS,
      '/repos/repo-1/pulls': PULLS,
      '/pulls/pr-1/reviews': [],
      '/agents': [{ id: 'agent-1', name: 'Bug Hunter' }],
    });
    const handler = makeGetFindingsHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'acme/widgets', pr: 5, agent: 'agent-1' });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe(
      "Agent 'Bug Hunter' has not reviewed this PR yet. Call run_agent_on_pr(repo, pr, agent) to run it.",
    );
  });

  it('returns the PR-not-found message with repo full_name', async () => {
    const http = clientRouting({ '/repos': REPOS, '/repos/repo-1/pulls': PULLS });
    const handler = makeGetFindingsHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'acme/widgets', pr: 999, agent: 'agent-1' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('PR #999 not found in acme/widgets');
  });

  it('returns the repo-not-found message for an unknown repo', async () => {
    const http = clientRouting({ '/repos': REPOS });
    const handler = makeGetFindingsHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'nope', pr: 5, agent: 'agent-1' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Repo 'nope' not found");
  });
});
