import { describe, expect, it, vi } from 'vitest';
import { DevDigestHttpClient } from '../../src/http/client.js';
import { getOnboardingTourInputSchema, makeGetOnboardingTourHandler } from '../../src/tools/get-onboarding-tour.js';

const REPOS = [{ id: 'repo-1', owner: 'acme', name: 'widgets', full_name: 'acme/widgets' }];

const SKELETON_PAGE = {
  status: 'skeleton',
  reason: 'No tour has been generated yet.',
  stale: false,
  provenance: {
    files_indexed: 120,
    files_excluded: 5,
    index_status: 'full',
    index_reason: null,
    prs_weighted: 0,
    generated_at: null,
    model: null,
  },
  facts: {
    stack: { language: { value: 'TypeScript', evidence_file: 'package.json' }, runtime: null, package_manager: null, frameworks: [] },
    ranked_files: [{ path: 'src/index.ts', pagerank: 0.9, hotness: 0, weighted: 0.9 }],
    setup_steps: [{ command: 'pnpm install', kind: 'install', evidence_file: 'package.json' }],
    routes: [],
  },
  tour: null,
};

const GENERATED_PAGE = {
  ...SKELETON_PAGE,
  status: 'generated',
  reason: null,
  provenance: { ...SKELETON_PAGE.provenance, generated_at: '2026-08-12T00:00:00Z', model: 'deepseek/deepseek-v4-flash' },
  tour: {
    sections: [
      { kind: 'architecture', title: 'Architecture Overview', body: 'This repo does X.', diagram: null, links: [] },
      { kind: 'critical_paths', title: 'Critical Paths', body: '', links: [], entries: [{ path: 'src/a.ts', reason: 'Core.' }] },
      { kind: 'run_locally', title: 'How to Run Locally', body: '- `pnpm install`', links: [] },
      { kind: 'reading_path', title: 'Guided Reading Path', body: '', links: [], entries: [{ path: 'src/index.ts', reason: 'Start here.' }] },
      { kind: 'first_tasks', title: 'First Tasks', body: 'Do X.', links: [] },
    ],
  },
};

function clientRouting(routes: Record<string, unknown>) {
  const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace('http://localhost:3001', '');
    if (path in routes) return new Response(JSON.stringify(routes[path]), { status: 200 });
    return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 });
  });
  return { http: new DevDigestHttpClient({ baseUrl: 'http://localhost:3001', fetchImpl }), fetchImpl };
}

function text(result: Awaited<ReturnType<ReturnType<typeof makeGetOnboardingTourHandler>>>) {
  return JSON.parse((result.content as { type: 'text'; text: string }[])[0]!.text);
}

describe('get_onboarding_tour input schema', () => {
  it('requires a non-empty repo string', () => {
    expect(getOnboardingTourInputSchema.safeParse({ repo: 'acme/widgets' }).success).toBe(true);
    expect(getOnboardingTourInputSchema.safeParse({ repo: '' }).success).toBe(false);
    expect(getOnboardingTourInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('get_onboarding_tour handler', () => {
  it('AC-47/AC-33 — returns the deterministic skeleton with its status and reason when no tour has been generated', async () => {
    const { http, fetchImpl } = clientRouting({
      '/repos': REPOS,
      '/repos/repo-1/tour': SKELETON_PAGE,
    });
    const handler = makeGetOnboardingTourHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'acme/widgets' });
    expect(result.isError).toBeUndefined();
    const parsed = text(result);
    expect(parsed.repo).toBe('acme/widgets');
    expect(parsed.status).toBe('skeleton');
    expect(parsed.reason).toBe('No tour has been generated yet.');
    expect(parsed.sections).toBeNull();
    expect(parsed.facts.ranked_files).toEqual(SKELETON_PAGE.facts.ranked_files);

    // AC-48 — exactly one GET, and no POST anywhere: every fetch call this
    // handler made used method GET.
    expect(fetchImpl).toHaveBeenCalledTimes(2); // resolveRepo's /repos + /repos/:id/tour
    for (const call of fetchImpl.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect(init?.method).toBe('GET');
    }
  });

  it('AC-47 — returns the stored tour\'s sections when one exists', async () => {
    const { http } = clientRouting({
      '/repos': REPOS,
      '/repos/repo-1/tour': GENERATED_PAGE,
    });
    const handler = makeGetOnboardingTourHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'acme/widgets' });
    const parsed = text(result);
    expect(parsed.status).toBe('generated');
    expect(parsed.reason).toBeUndefined();
    expect(parsed.sections).toHaveLength(5);
    expect(parsed.sections.map((s: { kind: string }) => s.kind)).toEqual([
      'architecture',
      'critical_paths',
      'run_locally',
      'reading_path',
      'first_tasks',
    ]);
  });

  it('AC-49 — an unknown repo (outside the caller\'s workspace) surfaces a not-found message, not the tour', async () => {
    const { http } = clientRouting({ '/repos': REPOS });
    const handler = makeGetOnboardingTourHandler(http, 'http://localhost:3001');
    const result = await handler({ repo: 'someone-else/private-repo' });
    expect(result.isError).toBe(true);
    expect((result.content as { type: 'text'; text: string }[])[0]!.text).toContain('not found');
  });
});
