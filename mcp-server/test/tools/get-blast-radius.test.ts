import { describe, expect, it, vi } from 'vitest';
import { DevDigestHttpClient } from '../../src/http/client.js';
import { getBlastRadiusInputSchema, makeGetBlastRadiusHandler } from '../../src/tools/get-blast-radius.js';

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

const BLAST_FULL = {
  status: 'full',
  data: {
    changed_symbols: [{ name: 'helper', file: 'src/utils/helper.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'helper',
        callers: [{ name: 'handler', file: 'src/api/route.ts', line: 10, rank: 5 }],
        endpoints_affected: ['GET /x'],
        crons_affected: [],
      },
    ],
  },
};

describe('get_blast_radius input schema', () => {
  it('requires a non-empty repo string and a positive integer pr', () => {
    expect(getBlastRadiusInputSchema.safeParse({ repo: 'acme/widgets', pr: 42 }).success).toBe(true);
    expect(getBlastRadiusInputSchema.safeParse({ repo: '', pr: 42 }).success).toBe(false);
    expect(getBlastRadiusInputSchema.safeParse({ repo: 'acme/widgets', pr: -1 }).success).toBe(false);
    expect(getBlastRadiusInputSchema.safeParse({ repo: 'acme/widgets', pr: 1.5 }).success).toBe(false);
  });
});

describe('get_blast_radius handler (real implementation, specs/07-blast-radius.md)', () => {
  it('fetches GET /pulls/:id/blast and maps it to a concise result', async () => {
    const http = clientRouting({
      '/repos': REPOS,
      '/repos/repo-1/pulls': PULLS,
      '/pulls/pr-1/blast': BLAST_FULL,
    });
    const handler = makeGetBlastRadiusHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'acme/widgets', pr: 5 });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(text(result));
    expect(parsed.status).toBe('full');
    expect(parsed.degraded_reason).toBeUndefined();
    expect(parsed.changed_symbols).toEqual([
      { name: 'helper', file: 'src/utils/helper.ts', kind: 'function' },
    ]);
    expect(parsed.downstream).toEqual([
      {
        symbol: 'helper',
        callers: [{ file: 'src/api/route.ts', line: 10, rank: 5 }],
        endpoints_affected: ['GET /x'],
        crons_affected: [],
      },
    ]);
  });

  it('actually calls the backend now — this is no longer the stub (the stub-era test asserted fetch was NEVER called)', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const path = String(url).replace('http://localhost:3001', '');
      const routes: Record<string, unknown> = {
        '/repos': REPOS,
        '/repos/repo-1/pulls': PULLS,
        '/pulls/pr-1/blast': BLAST_FULL,
      };
      return new Response(JSON.stringify(routes[path] ?? []), { status: 200 });
    });
    const http = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    const handler = makeGetBlastRadiusHandler(http, 'http://localhost:3001');
    await handler({ repo: 'acme/widgets', pr: 5 });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(0);
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).endsWith('/pulls/pr-1/blast'))).toBe(true);
  });

  it('surfaces degradedReason on the mapped result when the index is not full', async () => {
    const http = clientRouting({
      '/repos': REPOS,
      '/repos/repo-1/pulls': PULLS,
      '/pulls/pr-1/blast': {
        status: 'degraded',
        degradedReason: 'no_data',
        data: { changed_symbols: [], downstream: [] },
      },
    });
    const handler = makeGetBlastRadiusHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'acme/widgets', pr: 5 });
    const parsed = JSON.parse(text(result));
    expect(parsed.status).toBe('degraded');
    expect(parsed.degraded_reason).toBe('no_data');
    expect(parsed.changed_symbols).toEqual([]);
    expect(parsed.downstream).toEqual([]);
  });

  it('returns the PR-not-found message with repo full_name', async () => {
    const http = clientRouting({ '/repos': REPOS, '/repos/repo-1/pulls': PULLS });
    const handler = makeGetBlastRadiusHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'acme/widgets', pr: 999 });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('PR #999 not found in acme/widgets');
  });

  it('returns the repo-not-found message for an unknown repo', async () => {
    const http = clientRouting({ '/repos': REPOS });
    const handler = makeGetBlastRadiusHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'nope', pr: 5 });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Repo 'nope' not found");
  });

  it('never calls the blocking POST /pulls/:id/review — pure read', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(init?.method ?? 'GET').toBe('GET');
      const path = String(url).replace('http://localhost:3001', '');
      const routes: Record<string, unknown> = {
        '/repos': REPOS,
        '/repos/repo-1/pulls': PULLS,
        '/pulls/pr-1/blast': BLAST_FULL,
      };
      return new Response(JSON.stringify(routes[path] ?? []), { status: 200 });
    });
    const http = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    const handler = makeGetBlastRadiusHandler(http, 'http://localhost:3001');
    await handler({ repo: 'acme/widgets', pr: 5 });
    for (const call of fetchImpl.mock.calls) {
      expect(String(call[0])).not.toMatch(/\/review$/);
    }
  });
});
