import { describe, expect, it, vi } from 'vitest';
import { DevDigestHttpClient } from '../../src/http/client.js';
import {
  GET_BLAST_RADIUS_DESCRIPTION,
  getBlastRadiusInputSchema,
  makeGetBlastRadiusHandler,
} from '../../src/tools/get-blast-radius.js';

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

const BLAST_PATH = '/pulls/pr-1/blast?include_type_only=false';
const BLAST_PATH_TYPED = '/pulls/pr-1/blast?include_type_only=true';

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
  index: { status: 'full', indexedSha: 'abc', lowConfidence: true, reindexing: { state: 'running', done: 3, total: 10 } },
  overlay: { staleOverlay: true, overlayDegraded: false },
  graph: {
    nodes: [],
    edges: [],
    truncation: { truncated: true },
    entryPoints: { items: [{ path: 'src/api/route.ts', type: 'endpoint', label: 'GET /x', depth: 1 }], total: 1 },
    tests: { items: [{ path: 'src/api/route.test.ts', depth: 2 }], total: 4 },
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
      [BLAST_PATH]: BLAST_FULL,
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
        [BLAST_PATH]: BLAST_FULL,
      };
      return new Response(JSON.stringify(routes[path] ?? []), { status: 200 });
    });
    const http = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    const handler = makeGetBlastRadiusHandler(http, 'http://localhost:3001');
    await handler({ repo: 'acme/widgets', pr: 5 });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(0);
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).endsWith(BLAST_PATH))).toBe(true);
  });

  it('surfaces degradedReason on the mapped result when the index is not full', async () => {
    const http = clientRouting({
      '/repos': REPOS,
      '/repos/repo-1/pulls': PULLS,
      [BLAST_PATH]: {
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
        [BLAST_PATH]: BLAST_FULL,
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

  it('default call sends include_type_only=false; opt-in sends true', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const path = String(url).replace('http://localhost:3001', '');
      const routes: Record<string, unknown> = { '/repos': REPOS, '/repos/repo-1/pulls': PULLS };
      return new Response(JSON.stringify(routes[path] ?? BLAST_FULL), { status: 200 });
    });
    const http = new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl });
    const handler = makeGetBlastRadiusHandler(http, 'http://localhost:3001');
    await handler({ repo: 'acme/widgets', pr: 5 });
    await handler({ repo: 'acme/widgets', pr: 5, include_type_only: true });
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('http://localhost:3001' + BLAST_PATH);
    expect(urls).toContain('http://localhost:3001' + BLAST_PATH_TYPED);
  });

  it('surfaces entry points, affected tests and index flags', async () => {
    const http = clientRouting({ '/repos': REPOS, '/repos/repo-1/pulls': PULLS, [BLAST_PATH_TYPED]: BLAST_FULL });
    const handler = makeGetBlastRadiusHandler(http, 'http://localhost:3001');
    const parsed = JSON.parse(text(await handler({ repo: 'acme/widgets', pr: 5, include_type_only: true })));
    expect(parsed.entry_points).toEqual({
      items: [{ path: 'src/api/route.ts', type: 'endpoint', label: 'GET /x', depth: 1 }],
      total: 1,
    });
    expect(parsed.affected_tests.total).toBe(4);
    expect(parsed.index).toEqual({
      low_confidence: true,
      reindexing: { state: 'running', done: 3, total: 10 },
      stale_overlay: true,
      overlay_degraded: false,
      truncated: true,
    });
    expect(parsed.graph).toBeUndefined();
  });

  it('defaults new fields when the server omits them', async () => {
    const http = clientRouting({
      '/repos': REPOS,
      '/repos/repo-1/pulls': PULLS,
      [BLAST_PATH]: { status: 'full', data: { changed_symbols: [], downstream: [] } },
    });
    const handler = makeGetBlastRadiusHandler(http, 'http://localhost:3001');
    const parsed = JSON.parse(text(await handler({ repo: 'acme/widgets', pr: 5 })));
    expect(parsed.entry_points).toEqual({ items: [], total: 0 });
    expect(parsed.index.reindexing).toBeUndefined();
  });

  it('description keeps the original text and appends the new sentence', () => {
    expect(GET_BLAST_RADIUS_DESCRIPTION).toContain(
      'not that the check was skipped. The result also lists affected entry points (endpoints, crons, pages) and affected tests with totals, and follows only runtime edges unless include_type_only is set to true.',
    );
    expect(GET_BLAST_RADIUS_DESCRIPTION.startsWith("Maps which files, callers, and API endpoints/crons")).toBe(true);
  });
});
