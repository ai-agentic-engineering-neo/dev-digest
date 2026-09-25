/**
 * PullsService (application ring) with in-memory fakes — no DB, no Fastify.
 * Covers the local-first contract: GitHub sync/backfill when a client is
 * available, persisted data when it isn't, the detail mirror inside ONE
 * transaction, and the typed errors of the comment use cases.
 */
import { describe, it, expect } from 'vitest';
import type { PrCommit, PrDetail, PrFile, PrMeta } from '@devdigest/shared';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { InvalidInputError, NotFoundError } from '../src/platform/errors.js';
import { PullsService, type PullsServiceDeps, type Logger } from '../src/modules/pulls/service.js';
import type { DiffStats, PullRecord, PullRollup, RepoCoords } from '../src/modules/pulls/domain.js';
import { BACKFILL_LIMIT } from '../src/modules/pulls/constants.js';

const WS = 'ws-1';
const REPO: RepoCoords = { id: 'repo-1', owner: 'acme', name: 'api' };

function record(n: number, over: Partial<PullRecord> = {}): PullRecord {
  return {
    id: `pr-${n}`,
    repoId: REPO.id,
    number: n,
    title: `PR ${n}`,
    author: 'dev',
    branch: `b${n}`,
    base: 'main',
    headSha: `sha${n}`,
    additions: 0,
    deletions: 0,
    filesCount: 0,
    status: 'open',
    body: null,
    lastReviewedSha: null,
    openedAt: null,
    updatedAt: null,
    ...over,
  };
}

/** In-memory PullsRepository: PR rows + files/commits + rollups. */
class FakePulls {
  pulls: PullRecord[] = [];
  files = new Map<string, PrFile[]>();
  commits = new Map<string, PrCommit[]>();
  rollupByPr = new Map<string, PullRollup>();
  upserts: PrMeta[][] = [];
  stats: Array<[string, DiffStats]> = [];

  async findRepo(ws: string, id: string) {
    return ws === WS && id === REPO.id ? REPO : null;
  }
  async findRepoById(id: string) {
    return id === REPO.id ? REPO : null;
  }
  async findPull(ws: string, id: string) {
    return ws === WS ? (this.pulls.find((p) => p.id === id) ?? null) : null;
  }
  async listForRepo(repoId: string) {
    return this.pulls.filter((p) => p.repoId === repoId).map((p) => ({ ...p }));
  }
  async upsertListed(_ws: string, _repoId: string, listed: PrMeta[]) {
    this.upserts.push(listed);
    for (const l of listed) {
      if (!this.pulls.some((p) => p.number === l.number)) this.pulls.push(record(l.number, { title: l.title }));
    }
  }
  async setDiffStats(prId: string, s: DiffStats) {
    this.stats.push([prId, s]);
    Object.assign(this.pulls.find((p) => p.id === prId)!, s);
  }
  async listFiles(prId: string) {
    return this.files.get(prId) ?? [];
  }
  async listCommits(prId: string) {
    return this.commits.get(prId) ?? [];
  }
  async rollups(_ws: string, prIds: string[]) {
    return new Map(prIds.filter((id) => this.rollupByPr.has(id)).map((id) => [id, this.rollupByPr.get(id)!]));
  }
  async replaceFiles(prId: string, files: PrFile[]) {
    this.files.set(prId, files);
  }
  async replaceCommits(prId: string, commits: PrCommit[]) {
    this.commits.set(prId, commits);
  }
  async setDetailFields(prId: string, f: DiffStats & { body: string | null }) {
    Object.assign(this.pulls.find((p) => p.id === prId)!, f);
  }
}

function logger() {
  const warnings: string[] = [];
  const log: Logger = { warn: (_obj, msg) => warnings.push(msg) };
  return { log, warnings };
}

function build(opts: { github?: MockGitHubClient | Error; failTx?: boolean } = {}) {
  const repo = new FakePulls();
  const txRuns: number[] = [];
  const batches: number[] = [];
  const deps: PullsServiceDeps = {
    pulls: repo,
    github: async () => {
      if (opts.github instanceof Error) throw opts.github;
      return opts.github ?? new MockGitHubClient();
    },
    tx: {
      run: async (work) => {
        txRuns.push(1);
        if (opts.failTx) throw new Error('tx failed');
        return work({ pulls: repo });
      },
    },
    runBounded: async (tasks) => {
      batches.push(tasks.length);
      return Promise.all(tasks.map((t) => t()));
    },
    now: () => Date.UTC(2026, 5, 10),
  };
  return { svc: new PullsService(deps), repo, txRuns, batches };
}

describe('PullsService.listForRepo', () => {
  it('throws NotFoundError for a repo outside the workspace', async () => {
    const { svc } = build();
    await expect(svc.listForRepo('other-ws', REPO.id, logger().log)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('syncs the GitHub list, backfills at most BACKFILL_LIMIT diff stats and attaches rollups', async () => {
    const listed: PrMeta[] = Array.from({ length: 12 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      author: 'dev',
      branch: 'b',
      base: 'main',
      head_sha: 'h',
      additions: 0,
      deletions: 0,
      files_count: 0,
      status: 'open',
    }));
    const { svc, repo, batches } = build({ github: new MockGitHubClient({ pulls: listed }) });
    repo.rollupByPr.set('pr-1', {
      latestReviewId: 'rv-1',
      latestReviewIds: ['rv-1', 'rv-0'],
      lastReviewedAt: new Date('2026-02-01T00:00:00Z'),
      score: 80, findingsCounts: { CRITICAL: 1, WARNING: 0, SUGGESTION: 2 }, costUsd: 0.5 });

    const out = await svc.listForRepo(WS, REPO.id, logger().log);

    expect(repo.upserts).toHaveLength(1);
    expect(out).toHaveLength(12);
    expect(batches).toEqual([BACKFILL_LIMIT]);
    // Mock detail = 247/38/9; the response reflects the backfilled stats.
    expect(out.filter((p) => p.additions === 247 && p.files_count === 9)).toHaveLength(BACKFILL_LIMIT);
    expect(out[0]).toMatchObject({
      score: 80,
      cost_usd: 0.5,
      latest_review_id: 'rv-1',
      latest_review_ids: ['rv-1', 'rv-0'],
      last_reviewed_at: '2026-02-01T00:00:00.000Z',
      status: 'needs_review',
    });
    expect(out[1]).toMatchObject({
      score: null,
      cost_usd: null,
      latest_review_id: null,
      latest_review_ids: [],
      last_reviewed_at: null,
      findings_counts: null,
    });
  });

  it('serves persisted PRs (no sync, no backfill) when GitHub is unavailable', async () => {
    const { svc, repo, batches } = build({ github: new Error('GITHUB_TOKEN is not configured') });
    repo.pulls.push(record(1));
    const { log, warnings } = logger();

    const out = await svc.listForRepo(WS, REPO.id, log);

    expect(out.map((p) => p.number)).toEqual([1]);
    expect(repo.upserts).toHaveLength(0);
    expect(batches).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });
});

describe('PullsService.getDetail', () => {
  it('mirrors GitHub files/commits/body inside one transaction', async () => {
    const detail: Partial<PrDetail> = {
      files: [{ path: 'a.ts', additions: 1, deletions: 0, patch: '@@' }],
      commits: [{ sha: 'c1', message: 'm', author: 'a', committed_at: null }],
      body: 'hello',
    };
    const { svc, repo, txRuns } = build({ github: new MockGitHubClient({ detail }) });
    repo.pulls.push(record(5));

    const out = await svc.getDetail(WS, 'pr-5', logger().log);

    expect(out.id).toBe('pr-5');
    expect(txRuns).toHaveLength(1);
    expect(repo.files.get('pr-5')).toEqual(detail.files);
    expect(repo.commits.get('pr-5')).toEqual(detail.commits);
    expect(repo.pulls[0]).toMatchObject({ body: 'hello', additions: 247, filesCount: 9 });
  });

  it('falls back to the persisted mirror when the refresh transaction fails', async () => {
    const { svc, repo } = build({ failTx: true });
    repo.pulls.push(record(5, { body: 'stored' }));
    repo.files.set('pr-5', [{ path: 'old.ts', additions: 3, deletions: 1, patch: null }]);
    const { log, warnings } = logger();

    const out = await svc.getDetail(WS, 'pr-5', log);

    expect(out).toMatchObject({ id: 'pr-5', body: 'stored', files: [{ path: 'old.ts' }], commits: [] });
    expect(warnings).toHaveLength(1);
  });

  it('throws NotFoundError for an unknown PR', async () => {
    const { svc } = build();
    await expect(svc.getDetail(WS, 'missing', logger().log)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('PullsService comments', () => {
  it('lists [] when GitHub is unavailable', async () => {
    const { svc, repo } = build({ github: new Error('no token') });
    repo.pulls.push(record(7));
    expect(await svc.listComments(WS, 'pr-7', logger().log)).toEqual([]);
  });

  it('pins a new comment to the PR head sha', async () => {
    const gh = new MockGitHubClient();
    const { svc, repo } = build({ github: gh });
    repo.pulls.push(record(7, { headSha: 'deadbeef' }));

    await svc.createComment(WS, 'pr-7', { path: 'a.ts', line: 3, body: 'x', in_reply_to: 9 });

    expect(gh.createdComments[0]).toMatchObject({ commitId: 'deadbeef', path: 'a.ts', line: 3, inReplyTo: 9 });
  });

  it('keeps the github_unavailable wire code as an InvalidInputError', async () => {
    const { svc, repo } = build({ github: new Error('no token') });
    repo.pulls.push(record(7));
    const err = await svc.createComment(WS, 'pr-7', { path: 'a.ts', line: 1, body: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidInputError);
    expect(err.code).toBe('github_unavailable');
  });

  it('maps a GitHub rejection to github_comment_failed', async () => {
    const gh = new MockGitHubClient();
    gh.createReviewComment = async () => {
      throw new Error('line must be part of the diff');
    };
    const { svc, repo } = build({ github: gh });
    repo.pulls.push(record(7));
    const err = await svc.createComment(WS, 'pr-7', { path: 'a.ts', line: 1, body: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidInputError);
    expect(err.code).toBe('github_comment_failed');
    expect(err.message).toBe('line must be part of the diff');
  });
});
