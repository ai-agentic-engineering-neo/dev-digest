/**
 * PullsService orchestration without Postgres: a fake store and a fake GitHub
 * client. SQL stays covered by the integration lane (pulls-comments, run-cost,
 * integration).
 */
import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient, PrDetail, PrMeta } from '@devdigest/shared';
import { AppError, NotFoundError } from '../src/platform/errors.js';
import { DIFF_STAT_BACKFILL_LIMIT } from '../src/modules/pulls/constants.js';
import type { PullRepository, StoredPull, StoredRepo } from '../src/modules/pulls/repository.js';
import { PullsService, type PullsLog } from '../src/modules/pulls/service.js';

const REPO: StoredRepo = { id: 'repo-1', owner: 'acme', name: 'widgets' };

function pull(overrides: Partial<StoredPull> = {}): StoredPull {
  return {
    id: 'pr-1',
    repoId: REPO.id,
    number: 7,
    title: 'Add rate limiting',
    author: 'ada',
    branch: 'feat/rl',
    base: 'main',
    headSha: 'abc',
    lastReviewedSha: null,
    additions: 3,
    deletions: 1,
    filesCount: 1,
    status: 'open',
    body: 'persisted body',
    openedAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

function detail(overrides: Partial<PrDetail> = {}): PrDetail {
  return {
    number: 7,
    title: 'Add rate limiting',
    author: 'ada',
    branch: 'feat/rl',
    base: 'main',
    head_sha: 'abc',
    additions: 12,
    deletions: 4,
    files_count: 2,
    status: 'open',
    body: 'live body',
    files: [{ path: 'src/a.ts', additions: 12, deletions: 4, patch: '@@' }],
    commits: [
      {
        sha: 'abc',
        message: 'limit',
        author: 'ada',
        committed_at: '2026-01-02T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function fakeStore(seed: StoredPull[] = [pull()]): PullRepository {
  const rows = seed.map((row) => ({ ...row }));
  const store = {
    findRepo: vi.fn(async (workspaceId: string, id: string) =>
      workspaceId === 'ws' && id === REPO.id ? REPO : undefined,
    ),
    upsertFromList: vi.fn(async () => {}),
    listByRepo: vi.fn(async () => rows),
    updateDiffStats: vi.fn(async (id: string, stats: { additions: number; deletions: number; filesCount: number }) => {
      const row = rows.find((item) => item.id === id);
      if (row) {
        row.additions = stats.additions;
        row.deletions = stats.deletions;
        row.filesCount = stats.filesCount;
      }
    }),
    latestReviewScoreByPr: vi.fn(async () => new Map<string, number | null>([['pr-1', 80]])),
    sumCostByPr: vi.fn(async () => new Map<string, number | null>([['pr-1', 0.42]])),
    findPull: vi.fn(async (workspaceId: string, id: string) =>
      workspaceId === 'ws' ? rows.find((row) => row.id === id) : undefined,
    ),
    replaceFiles: vi.fn(async () => {}),
    replaceCommits: vi.fn(async () => {}),
    updateDetail: vi.fn(async () => {}),
    listFiles: vi.fn(async () => [{ path: 'src/old.ts', additions: 1, deletions: 0, patch: null }]),
    listCommits: vi.fn(async () => [
      { sha: 'old', message: 'old', author: 'ada', committed_at: null },
    ]),
  };
  return store as unknown as PullRepository;
}

function service(store: PullRepository, github: () => Promise<GitHubClient>, log?: PullsLog) {
  return new PullsService({
    store,
    github,
    log: log ?? { warn: vi.fn() },
    now: () => Date.parse('2026-01-03T00:00:00.000Z'),
  });
}

describe('PullsService.list', () => {
  it('syncs from GitHub, then returns persisted rows with score and cost', async () => {
    const store = fakeStore();
    const listed: PrMeta[] = [
      {
        number: 7,
        title: 'Add rate limiting',
        author: 'ada',
        branch: 'feat/rl',
        base: 'main',
        head_sha: 'abc',
        additions: 0,
        deletions: 0,
        files_count: 0,
        status: 'open',
      },
    ];
    const gh = { listPullRequests: vi.fn(async () => listed) } as unknown as GitHubClient;
    const rows = await service(store, async () => gh).list('ws', REPO.id);

    expect(gh.listPullRequests).toHaveBeenCalledWith({ owner: 'acme', name: 'widgets' });
    expect(store.upsertFromList).toHaveBeenCalledWith('ws', REPO.id, listed);
    expect(rows[0]).toMatchObject({
      id: 'pr-1',
      status: 'needs_review',
      score: 80,
      cost_usd: 0.42,
      additions: 3,
    });
  });

  it('serves persisted PRs when GitHub is unavailable', async () => {
    const store = fakeStore();
    const log = { warn: vi.fn() };
    const rows = await service(store, async () => {
      throw new Error('no token');
    }, log).list('ws', REPO.id);

    expect(store.upsertFromList).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'GitHub client unavailable (no token / offline); serving persisted PRs',
    );
  });

  it('backfills at most DIFF_STAT_BACKFILL_LIMIT zero-stat PRs', async () => {
    const zeros = Array.from({ length: DIFF_STAT_BACKFILL_LIMIT + 3 }, (_, i) =>
      pull({
        id: `zero-${i}`,
        number: i + 1,
        additions: 0,
        deletions: 0,
        filesCount: 0,
      }),
    );
    const store = fakeStore(zeros);
    const getPullRequest = vi.fn(async () => detail({ additions: 9, deletions: 2, files_count: 1 }));
    const gh = {
      listPullRequests: vi.fn(async () => []),
      getPullRequest,
    } as unknown as GitHubClient;

    const rows = await service(store, async () => gh).list('ws', REPO.id);

    expect(getPullRequest).toHaveBeenCalledTimes(DIFF_STAT_BACKFILL_LIMIT);
    expect(rows.filter((row) => row.additions === 9)).toHaveLength(DIFF_STAT_BACKFILL_LIMIT);
    expect(rows.filter((row) => row.additions === 0)).toHaveLength(3);
  });

  it('throws when the repo is outside the workspace', async () => {
    const store = fakeStore();
    await expect(service(store, async () => ({}) as GitHubClient).list('other', REPO.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('PullsService.get', () => {
  it('refreshes files and commits from GitHub and keeps the local id', async () => {
    const store = fakeStore();
    const live = detail();
    const gh = { getPullRequest: vi.fn(async () => live) } as unknown as GitHubClient;
    const result = await service(store, async () => gh).get('ws', 'pr-1');

    expect(result.id).toBe('pr-1');
    expect(result.body).toBe('live body');
    expect(store.replaceFiles).toHaveBeenCalledWith('pr-1', live.files);
    expect(store.replaceCommits).toHaveBeenCalledWith('pr-1', live.commits);
  });

  it('serves the persisted detail when GitHub fails', async () => {
    const store = fakeStore();
    const result = await service(store, async () => {
      throw new Error('offline');
    }).get('ws', 'pr-1');

    expect(result.body).toBe('persisted body');
    expect(result.files).toEqual([{ path: 'src/old.ts', additions: 1, deletions: 0, patch: null }]);
    expect(result.status).toBe('open');
  });
});

describe('PullsService comments', () => {
  it('returns no comments when GitHub is down', async () => {
    const store = fakeStore();
    const comments = await service(store, async () => {
      throw new Error('no token');
    }).listComments('ws', 'pr-1');
    expect(comments).toEqual([]);
  });

  it('refuses to post a comment without a GitHub client', async () => {
    const store = fakeStore();
    const err = await service(store, async () => {
      throw new Error('no token');
    })
      .createComment('ws', 'pr-1', { path: 'a.ts', line: 1, body: 'hi' })
      .catch((error: unknown) => error);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('github_unavailable');
  });

  it('pins a new comment to the PR head sha', async () => {
    const store = fakeStore();
    const createReviewComment = vi.fn(async () => ({ id: 9 }));
    const gh = { createReviewComment } as unknown as GitHubClient;
    await service(store, async () => gh).createComment('ws', 'pr-1', {
      path: 'a.ts',
      line: 4,
      body: 'nit',
    });
    expect(createReviewComment).toHaveBeenCalledWith(
      { owner: 'acme', name: 'widgets' },
      7,
      expect.objectContaining({ commitId: 'abc', path: 'a.ts', line: 4, body: 'nit' }),
    );
  });
});
