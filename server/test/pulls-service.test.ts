/**
 * PullsService against in-memory ports: the offline list path (no GitHub
 * token) with review rollups, and the comment proxy's error mapping.
 */
import { describe, it, expect } from 'vitest';
import type { Repo } from '@devdigest/shared';
import { PullsService } from '../src/modules/pulls/service.js';
import type { PullStore, ReviewRollups, StoredPull } from '../src/modules/pulls/ports.js';

const repo: Repo = {
  id: 'repo-1',
  workspace_id: 'ws-1',
  owner: 'acme',
  name: 'widgets',
  full_name: 'acme/widgets',
  default_branch: 'main',
  clone_path: null,
  last_polled_at: null,
  created_by: null,
};

function pull(id: string, over: Partial<StoredPull> = {}): StoredPull {
  return {
    id,
    repoId: repo.id,
    number: 1,
    title: 'Add widgets',
    author: 'octocat',
    branch: 'feat',
    base: 'main',
    headSha: 'abc',
    additions: 10,
    deletions: 2,
    filesCount: 1,
    ghStatus: 'open',
    lastReviewedSha: null,
    openedAt: null,
    updatedAt: new Date(),
    body: null,
    ...over,
  };
}

function setup(stored: StoredPull[], reviews: Partial<ReviewRollups> = {}) {
  const warnings: string[] = [];
  const pulls: PullStore = {
    upsertFromGitHub: async () => {},
    listForRepo: async () => stored,
    getById: async (_ws, id) => stored.find((p) => p.id === id),
    setDiffStats: async () => {},
    saveDetail: async () => {},
    filesAndCommits: async () => ({ files: [], commits: [] }),
  };
  const service = new PullsService({
    pulls,
    repos: { getById: async (_ws, id) => (id === repo.id ? repo : undefined) },
    reviews: {
      reviewRefsForPulls: async () => [],
      findingSeverities: async () => [],
      runCostsForPulls: async () => [],
      ...reviews,
    },
    github: async () => {
      throw new Error('GITHUB_TOKEN is not configured');
    },
    log: { warn: (_obj, msg) => void warnings.push(msg) },
  });
  return { service, warnings };
}

describe('PullsService.listForRepo', () => {
  it('serves persisted PRs offline with score, findings and cost rolled up', async () => {
    const { service, warnings } = setup(
      [pull('pr-1', { lastReviewedSha: 'abc' }), pull('pr-2', { number: 2 })],
      {
        // Newest first: agent a1 re-ran, so only its latest review counts.
        reviewRefsForPulls: async () => [
          { id: 'rv-3', prId: 'pr-1', agentId: 'a1', score: 80 },
          { id: 'rv-2', prId: 'pr-1', agentId: 'a2', score: 60 },
          { id: 'rv-1', prId: 'pr-1', agentId: 'a1', score: 10 },
        ],
        findingSeverities: async (reviewIds) => {
          expect(reviewIds.sort()).toEqual(['rv-2', 'rv-3']);
          return [
            { reviewId: 'rv-3', severity: 'CRITICAL' },
            { reviewId: 'rv-2', severity: 'WARNING' },
            { reviewId: 'rv-2', severity: 'WARNING' },
          ];
        },
        runCostsForPulls: async () => [
          { prId: 'pr-1', costUsd: 0.1 },
          { prId: 'pr-1', costUsd: 0.2 },
        ],
      },
    );

    const [first, second] = await service.listForRepo('ws-1', repo.id);

    expect(first).toMatchObject({
      id: 'pr-1',
      status: 'reviewed',
      score: 80,
      total_cost_usd: 0.3,
      findings_counts: { CRITICAL: 1, WARNING: 2, SUGGESTION: 0 },
    });
    // Never reviewed: null rollups, not zeroes.
    expect(second).toMatchObject({
      id: 'pr-2',
      status: 'needs_review',
      score: null,
      total_cost_usd: null,
      findings_counts: null,
    });
    expect(warnings).toHaveLength(1);
  });

  it('404s for a repo outside the workspace', async () => {
    const { service } = setup([]);
    await expect(service.listForRepo('ws-1', 'other')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('PullsService comments', () => {
  it('without a GitHub token: reading is empty, posting is a 400', async () => {
    const { service } = setup([pull('pr-1')]);
    expect(await service.listComments('ws-1', 'pr-1')).toEqual([]);
    await expect(
      service.addComment('ws-1', 'pr-1', { path: 'a.ts', line: 1, body: 'nit' }),
    ).rejects.toMatchObject({ code: 'github_unavailable', statusCode: 400 });
  });
});
