import type {
  CreateReviewCommentInput,
  GitHubClient,
  PrDetail,
  PrReviewComment,
} from '@devdigest/shared';
import { RepoNotFound } from '../../_shared/domain/errors.js';
import type { Logger } from '../../_shared/domain/logger.js';
import { aggregatePrCosts } from '../domain/cost.js';
import { GitHubCommentFailed, GitHubUnavailable, PullNotFound } from '../domain/errors.js';
import type { GitHubFor, PullsRepository } from '../domain/ports.js';
import { deriveReviewStatus } from '../domain/status.js';
import {
  BACKFILL_LIMIT,
  needsStatsBackfill,
  type PullListItem,
  type PullRepo,
  type StoredPull,
} from '../domain/types.js';

export interface PullsDeps {
  pulls: PullsRepository;
  github: GitHubFor;
  log: Logger;
  now: () => number;
}

/** A new inline comment; `commitId` is filled in from the PR head. */
export type NewPrComment = Omit<CreateReviewCommentInput, 'commitId'>;

/**
 * F1 — pull requests: import from GitHub, read, inline comments.
 * Local-first: GitHub refreshes data when a token works, but reads never fail
 * because GitHub is unreachable — persisted PRs stay viewable offline.
 * Reviews are started elsewhere (manual trigger in the reviews module).
 */
export class PullsService {
  constructor(private readonly d: PullsDeps) {}

  async listForRepo(workspaceId: string, repoId: string): Promise<PullListItem[]> {
    const { pulls, log } = this.d;
    const repo = await pulls.findRepo(workspaceId, repoId);
    if (!repo) throw new RepoNotFound();

    const gh = await this.tryGitHub('GitHub client unavailable (no token / offline); serving persisted PRs');
    if (gh) {
      try {
        await pulls.upsertFromList(workspaceId, repo.id, await gh.listPullRequests(ref(repo)));
      } catch (err) {
        log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await pulls.listForRepo(repo.id);
    if (gh) await this.backfillStats(gh, repo, rows);

    const ids = rows.map((r) => r.id);
    const [scores, costs] =
      ids.length > 0
        ? await Promise.all([
            pulls.latestScores(ids),
            pulls.runCosts(workspaceId, ids).then(aggregatePrCosts),
          ])
        : [new Map<string, number | null>(), new Map<string, number | null>()];

    const now = this.d.now();
    return rows.map((r) => ({
      ...r,
      reviewStatus: deriveReviewStatus({
        ghStatus: r.ghStatus,
        lastReviewedSha: r.lastReviewedSha,
        headSha: r.headSha,
        updatedAt: r.updatedAt,
        now,
      }),
      score: scores.get(r.id) ?? null,
      costUsd: costs.get(r.id) ?? null,
    }));
  }

  /** Full PR detail: refreshed from GitHub when possible, else the persisted copy. */
  async detail(workspaceId: string, pullId: string): Promise<PrDetail> {
    const { pull, repo } = await this.resolve(workspaceId, pullId);
    try {
      const gh = await this.d.github();
      const detail = await gh.getPullRequest(ref(repo), pull.number);
      await this.d.pulls.storeDetail(pull.id, detail);
      return { ...detail, id: pull.id };
    } catch (err) {
      this.d.log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      return this.d.pulls.persistedDetail(pull);
    }
  }

  /** Inline review comments, proxied live from GitHub; [] when unavailable. */
  async listComments(workspaceId: string, pullId: string): Promise<PrReviewComment[]> {
    const { pull, repo } = await this.resolve(workspaceId, pullId);
    const gh = await this.tryGitHub('GitHub client unavailable; serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments(ref(repo), pull.number);
    } catch (err) {
      this.d.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  /** Post one inline comment (or reply) on the PR head commit. */
  async createComment(workspaceId: string, pullId: string, input: NewPrComment): Promise<PrReviewComment> {
    const { pull, repo } = await this.resolve(workspaceId, pullId);
    let gh: GitHubClient;
    try {
      gh = await this.d.github();
    } catch {
      throw new GitHubUnavailable();
    }
    try {
      return await gh.createReviewComment(ref(repo), pull.number, { ...input, commitId: pull.headSha });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new GitHubCommentFailed(msg, { cause: String(err) });
    }
  }

  private async resolve(workspaceId: string, pullId: string): Promise<{ pull: StoredPull; repo: PullRepo }> {
    const pull = await this.d.pulls.findPull(workspaceId, pullId);
    if (!pull) throw new PullNotFound();
    const repo = await this.d.pulls.repoOf(pull);
    if (!repo) throw new RepoNotFound();
    return { pull, repo };
  }

  private async tryGitHub(warning: string): Promise<GitHubClient | null> {
    try {
      return await this.d.github();
    } catch (err) {
      this.d.log.warn({ err }, warning);
      return null;
    }
  }

  /** Fill in zeroed diff stats from the detail endpoint, a few PRs per request. */
  private async backfillStats(gh: GitHubClient, repo: PullRepo, rows: StoredPull[]): Promise<void> {
    for (const r of rows.filter(needsStatsBackfill).slice(0, BACKFILL_LIMIT)) {
      try {
        const detail = await gh.getPullRequest(ref(repo), r.number);
        const stats = {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        };
        await this.d.pulls.updateStats(r.id, stats);
        Object.assign(r, stats);
      } catch (err) {
        this.d.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }
}

function ref(repo: PullRepo): { owner: string; name: string } {
  return { owner: repo.owner, name: repo.name };
}
