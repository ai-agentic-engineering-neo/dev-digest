import type {
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { PullRecord, PullRepo, PullsRepositoryPort, PullsServiceDeps } from './types.js';
import { deriveReviewStatus } from './status.js';
import { latestRoundCost } from './cost.js';
import { DIFF_STAT_BACKFILL_LIMIT } from './constants.js';
import { toPrMeta } from './helpers.js';

/**
 * F1 — pulls service. Business logic for the PR list + detail:
 *   - local-first GitHub sync (never fails a read when GitHub is unreachable)
 *   - diff-stat backfill, latest-review score and latest-round cost per PR
 *   - inline review comments proxied live to GitHub
 *
 * No HTTP and no raw SQL here — persistence goes through PullsRepositoryPort,
 * GitHub through the injected client factory, pure transforms through helpers.ts.
 */
export class PullsService {
  private repo: PullsRepositoryPort;
  private github: PullsServiceDeps['github'];
  private log: PullsServiceDeps['log'];

  constructor(deps: PullsServiceDeps) {
    this.repo = deps.pulls;
    this.github = deps.github;
    this.log = deps.log;
  }

  /** The GitHub client, or null when no token is configured / offline. */
  private async githubOrNull(reason: string): Promise<GitHubClient | null> {
    try {
      return await this.github();
    } catch (err) {
      this.log.warn({ err }, reason);
      return null;
    }
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<PullRepo> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private async requirePrAndRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: PullRecord; repo: PullRepo }> {
    const pr = await this.repo.getById(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(workspaceId, pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  /** GET /repos/:id/pulls — sync from GitHub when possible, then serve persisted rows. */
  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const ref = { owner: repo.owner, name: repo.name };
    const gh = await this.githubOrNull(
      'GitHub client unavailable (no token / offline); serving persisted PRs',
    );

    // Local-first: sync from GitHub when a token is configured, but never
    // fail the read — already-imported/seeded PRs stay viewable offline.
    if (gh) {
      try {
        await this.repo.upsertFromGitHub(workspaceId, repo.id, await gh.listPullRequests(ref));
      } catch (err) {
        this.log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.repo.listByRepo(repo.id);

    // Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs
    // land with zeroed size/diff. Backfill them once from the detail endpoint
    // so the list shows real S/M/L + ± counts. Capped per request (each backfill
    // is a detail fetch) — the periodic refetch chips away at any remainder.
    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, DIFF_STAT_BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest(ref, r.number);
          const stats = {
            additions: detail.additions,
            deletions: detail.deletions,
            filesCount: detail.files_count,
          };
          await this.repo.updateDiffStats(r.id, stats);
          Object.assign(r, stats);
        } catch (err) {
          this.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
        }
      }
    }

    // Latest-review SCORE per PR (rows come newest-first → first seen wins).
    // The per-severity breakdown is intentionally not on the list.
    const prIds = rows.map((r) => r.id);
    const scoreByPr = new Map<string, number | null>();
    for (const rv of await this.repo.reviewScoresNewestFirst(prIds)) {
      if (!scoreByPr.has(rv.prId)) scoreByPr.set(rv.prId, rv.score);
    }
    // M1 — latest-round COST per PR (newest run of each agent, summed).
    const costByPr = latestRoundCost(await this.repo.runCostsNewestFirst(prIds));

    const now = Date.now();
    return rows.map((r) =>
      toPrMeta(r, {
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        score: scoreByPr.get(r.id) ?? null,
        costUsd: costByPr.get(r.id) ?? null,
      }),
    );
  }

  /** GET /pulls/:id */
  async getDetail(workspaceId: string, prId: string): Promise<PrDetail> {
    const { pr, repo } = await this.requirePrAndRepo(workspaceId, prId);
    return this.detailFor(pr, repo);
  }

  /** GET /repos/:id/pulls/:number — the route is keyed by PR number, the rows by uuid. */
  async getDetailByNumber(workspaceId: string, repoId: string, number: number): Promise<PrDetail> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const pr = await this.repo.getByNumber(workspaceId, repo.id, number);
    if (!pr) throw new NotFoundError('Pull request not found');
    return this.detailFor(pr, repo);
  }

  /**
   * Local-first: refresh detail from GitHub when a token is configured
   * (persisted atomically); otherwise — or on any failure — serve the
   * persisted files/commits/body so PR detail works offline.
   */
  private async detailFor(pr: PullRecord, repo: PullRepo): Promise<PrDetail> {
    try {
      const gh = await this.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.repo.replaceDetail(pr.id, detail);
      return { ...detail, id: pr.id };
    } catch (err) {
      this.log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const persisted = await this.repo.getPersistedDetail(pr.id);
      if (!persisted) throw new NotFoundError('Pull request not found');
      return persisted;
    }
  }

  /** GET /pulls/:id/comments — proxied live to GitHub; [] when unavailable. */
  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.requirePrAndRepo(workspaceId, prId);
    const gh = await this.githubOrNull('GitHub client unavailable; serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      this.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  /** POST /pulls/:id/comments — creates the comment on GitHub immediately. */
  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.requirePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }
}
