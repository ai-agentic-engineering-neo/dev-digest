import { describe, it, expect } from 'vitest';
import type { GitHubClient, PrDetail } from '@devdigest/shared';
import { PullsService } from '../src/modules/pulls/application/pulls.service.js';
import { RepoNotFound } from '../src/modules/_shared/domain/errors.js';
import { GitHubCommentFailed, GitHubUnavailable, PullNotFound } from '../src/modules/pulls/domain/errors.js';
import type { PullsRepository } from '../src/modules/pulls/domain/ports.js';
import type { StoredPull } from '../src/modules/pulls/domain/types.js';

const repo = { id: 'r1', owner: 'acme', name: 'api' };
const pull = (n: number, over: Partial<StoredPull> = {}): StoredPull => ({
  id: `p${n}`, repoId: 'r1', number: n, title: `PR ${n}`, author: 'a', branch: 'b', base: 'main',
  headSha: 'h', additions: 0, deletions: 0, filesCount: 0, ghStatus: 'open', openedAt: null,
  updatedAt: null, lastReviewedSha: null, body: null, ...over,
});

function setup(gh: Partial<GitHubClient> | 'offline', rows: StoredPull[] = [pull(1)]) {
  const warnings: string[] = [];
  const statsUpdates: string[] = [];
  const pulls: PullsRepository = {
    findRepo: async (ws, id) => (ws === 'w1' && id === 'r1' ? repo : undefined),
    repoOf: async () => repo,
    findPull: async (ws, id) => (ws === 'w1' ? rows.find((r) => r.id === id) : undefined),
    listForRepo: async () => rows,
    upsertFromList: async () => {},
    updateStats: async (id) => void statsUpdates.push(id),
    storeDetail: async () => {},
    persistedDetail: async (p) => ({ id: p.id, persisted: true }) as unknown as PrDetail,
    latestScores: async () => new Map([['p1', 80]]),
    runCosts: async () => [{ prId: 'p1', agentId: 'a1', status: 'done', costUsd: 0.5 }],
  };
  const service = new PullsService({
    pulls,
    github: async () => {
      if (gh === 'offline') throw new Error('no token');
      return gh as GitHubClient;
    },
    log: { warn: (_o, msg) => void warnings.push(msg) },
    now: () => 0,
  });
  return { service, warnings, statsUpdates };
}

describe('PullsService', () => {
  it('lists persisted PRs offline with score, cost and derived status', async () => {
    const { service, warnings } = setup('offline');
    const [item] = await service.listForRepo('w1', 'r1');
    expect(item).toMatchObject({ id: 'p1', score: 80, costUsd: 0.5, reviewStatus: 'needs_review' });
    expect(warnings).toHaveLength(1);
  });

  it('backfills zeroed diff stats for at most 10 PRs per request', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => pull(i + 1));
    const gh = {
      listPullRequests: async () => [],
      getPullRequest: async () => ({ additions: 3, deletions: 1, files_count: 2 }) as PrDetail,
    };
    const { service, statsUpdates } = setup(gh, rows);
    const items = await service.listForRepo('w1', 'r1');
    expect(statsUpdates).toHaveLength(10);
    expect(items[0]).toMatchObject({ additions: 3, deletions: 1, filesCount: 2 });
    expect(items[11]).toMatchObject({ additions: 0 });
  });

  it('raises RepoNotFound / PullNotFound outside the workspace', async () => {
    const { service } = setup('offline');
    await expect(service.listForRepo('w2', 'r1')).rejects.toBeInstanceOf(RepoNotFound);
    await expect(service.detail('w2', 'p1')).rejects.toBeInstanceOf(PullNotFound);
  });

  it('detail falls back to the persisted copy when GitHub fails', async () => {
    const { service } = setup('offline');
    expect(await service.detail('w1', 'p1')).toMatchObject({ id: 'p1', persisted: true });
  });

  it('comments: [] offline; posting needs GitHub and wraps its rejection', async () => {
    const { service } = setup('offline');
    expect(await service.listComments('w1', 'p1')).toEqual([]);
    await expect(service.createComment('w1', 'p1', { path: 'a.ts', line: 1, body: 'x' })).rejects.toBeInstanceOf(
      GitHubUnavailable,
    );

    const failing = setup({ createReviewComment: async () => Promise.reject(new Error('422 line not in diff')) });
    const err = await failing.service
      .createComment('w1', 'p1', { path: 'a.ts', line: 1, body: 'x' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHubCommentFailed);
    expect(err).toMatchObject({ message: '422 line not in diff', details: { cause: 'Error: 422 line not in diff' } });
  });
});
