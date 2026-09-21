import { describe, expect, it, vi } from 'vitest';
import { DevDigestHttpClient } from '../../src/http/client.js';
import { getConventionsInputSchema, makeGetConventionsHandler } from '../../src/tools/get-conventions.js';

const REPOS = [{ id: 'repo-1', owner: 'acme', name: 'widgets', full_name: 'acme/widgets' }];

function clientRouting(routes: Record<string, unknown>) {
  const fetchImpl = vi.fn(async (url: string | URL) => {
    const path = String(url).replace('http://localhost:3001', '');
    if (path in routes) return new Response(JSON.stringify(routes[path]), { status: 200 });
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 });
  });
  return new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
}

function text(result: Awaited<ReturnType<ReturnType<typeof makeGetConventionsHandler>>>) {
  return JSON.parse((result.content as { type: 'text'; text: string }[])[0]!.text);
}

describe('get_conventions input schema', () => {
  it('requires a non-empty repo string', () => {
    expect(getConventionsInputSchema.safeParse({ repo: 'acme/widgets' }).success).toBe(true);
    expect(getConventionsInputSchema.safeParse({ repo: '' }).success).toBe(false);
    expect(getConventionsInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('get_conventions handler', () => {
  it('returns the empty-state note when scan is null', async () => {
    const http = clientRouting({
      '/repos': REPOS,
      '/repos/repo-1/conventions': { scan: null, candidates: [] },
    });
    const handler = makeGetConventionsHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'acme/widgets' });
    expect(result.isError).toBeUndefined();
    const parsed = text(result);
    expect(parsed).toEqual({
      repo: 'acme/widgets',
      scanned_at: null,
      conventions: [],
      note: expect.stringContaining('has not been scanned'),
    });
  });

  it('returns only accepted candidates, dropping id and scan metadata', async () => {
    const http = clientRouting({
      '/repos': REPOS,
      '/repos/repo-1/conventions': {
        scan: { id: 'scan-1', repo_id: 'repo-1', sample_file_count: 5, source_sha: 'abc', model: 'gpt', created_at: '2026-01-01T00:00:00Z' },
        candidates: [
          {
            id: 'c1',
            category: 'style',
            rule: 'Use double quotes',
            evidence_path: 'src/a.ts',
            evidence_start_line: 1,
            evidence_end_line: 2,
            evidence_snippet: 'const x = "y"',
            confidence: 0.9,
            status: 'accepted',
          },
          {
            id: 'c2',
            category: 'style',
            rule: 'Pending rule',
            evidence_path: null,
            evidence_start_line: null,
            evidence_end_line: null,
            evidence_snippet: null,
            confidence: null,
            status: 'pending',
          },
          {
            id: 'c3',
            category: 'style',
            rule: 'Rejected rule',
            evidence_path: null,
            evidence_start_line: null,
            evidence_end_line: null,
            evidence_snippet: null,
            confidence: null,
            status: 'rejected',
          },
        ],
      },
    });
    const handler = makeGetConventionsHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'acme/widgets' });
    const parsed = text(result);
    expect(parsed.repo).toBe('acme/widgets');
    expect(parsed.scanned_at).toBe('2026-01-01T00:00:00Z');
    expect(parsed.note).toBeUndefined();
    expect(parsed.conventions).toEqual([
      {
        rule: 'Use double quotes',
        category: 'style',
        evidence_path: 'src/a.ts',
        evidence_start_line: 1,
        evidence_end_line: 2,
        evidence_snippet: 'const x = "y"',
        confidence: 0.9,
      },
    ]);
  });

  it('returns isError with the repo-not-found message when the repo is unknown', async () => {
    const http = clientRouting({ '/repos': REPOS });
    const handler = makeGetConventionsHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'nope' });
    expect(result.isError).toBe(true);
    const msg = (result.content as { type: 'text'; text: string }[])[0]!.text;
    expect(msg).toContain("Repo 'nope' not found");
  });
});
