import type {
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { deriveReviewStatus } from './status.js';
import { scoreForFindings, summarizeFindings } from './findings-summary.js';
import { BACKFILL_LIMIT } from './constants.js';
import type { PullRecord, PullsRepository } from './repository.js';
import { toPrDetail, toPrMeta, type PullListRow } from './helpers.js';

/** The repo lookup this module needs — declared by the consumer, not imported. */
export interface PullsRepoReader {
  getById(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; owner: string; name: string } | undefined>;
  workspaceIdFor(repoId: string): Promise<string | null>;
}

/** Resolving a GitHub client can fail (no token / offline); that is a use-case concern. */
export type GitHubFactory = () => Promise<GitHubClient>;

export interface PullsLogger {
  warn(obj: unknown, msg: string): void;
}

/**
 * F1 — pulls use cases. PR import via the GitHub port (list + per-PR detail),
 * plus the PR-list read model.
 *
 * Local-first is a policy of this layer, not of the transport: a missing or
 * failing GitHub client never fails a read — already-imported or seeded PRs
 * stay viewable offline. Review triggering is manual and owned by the reviews
 * module; nothing here starts one.
 */
export class PullsService {
  constructor(
    private readonly pulls: PullsRepository,
    private readonly repos: PullsRepoReader,
    private readonly github: GitHubFactory,
    private readonly log: PullsLogger,
  ) {}

  private async githubOrNull(reason: string): Promise<GitHubClient | null> {
    try {
      return await this.github();
    } catch (err) {
      this.log.warn({ err }, reason);
      return null;
    }
  }

  private async requireRepoOf(workspaceId: string, pr: PullRecord) {
    const repo = await this.repos.getById(workspaceId, pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** Sync from GitHub when possible, then serve the persisted list with its derived columns. */
  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.githubOrNull(
      'GitHub client unavailable (no token / offline); serving persisted PRs',
    );
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await this.pulls.upsertFromGitHub(workspaceId, repo.id, pr, { withOpenedAt: true });
        }
      } catch (err) {
        this.log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.pulls.listForRepo(repo.id);
    if (gh) await this.backfillDiffStats(gh, repo, rows);

    const { openFindingsByPr, costByPr } = await this.pulls.readModelFor(rows.map((r) => r.id));
    const now = Date.now();
    return rows.map((r) => {
      const found = openFindingsByPr.get(r.id);
      const row: PullListRow = {
        pull: r,
        reviewStatus: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        score: found ? scoreForFindings(found) : null,
        costUsd: costByPr.get(r.id) ?? null,
        findings: found ? summarizeFindings(found) : null,
      };
      return toPrMeta(row);
    });
  }

  /**
   * Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs land
   * with zeroed size. Backfill from the detail endpoint, capped per request —
   * the periodic refetch chips away at any remainder. Mutates `rows` so the
   * response reflects the backfill without a re-read.
   */
  private async backfillDiffStats(
    gh: GitHubClient,
    repo: { owner: string; name: string },
    rows: PullRecord[],
  ): Promise<void> {
    const needStats = rows
      .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
      .slice(0, BACKFILL_LIMIT);
    for (const r of needStats) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
        const stats = {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        };
        await this.pulls.updateDiffStats(r.id, stats);
        Object.assign(r, stats);
      } catch (err) {
        this.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  /** Refresh detail from GitHub when a token is configured; otherwise serve what is persisted. */
  async detail(workspaceId: string, prId: string): Promise<PrDetail> {
    const pr = await this.pulls.getById(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.requireRepoOf(workspaceId, pr);

    try {
      const gh = await this.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.pulls.replaceFiles(pr.id, detail.files);
      await this.pulls.replaceCommits(pr.id, detail.commits);
      await this.pulls.updateDetail(pr.id, detail.body ?? null, {
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });
      return { ...detail, id: pr.id };
    } catch (err) {
      this.log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      return toPrDetail(
        pr,
        await this.pulls.listFiles(pr.id),
        await this.pulls.listCommits(pr.id),
      );
    }
  }

  /**
   * Inline review comments are proxied live to GitHub with no local mirror, so
   * the Files-changed tab stays in lock-step and never serves a stale copy.
   */
  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const pr = await this.pulls.getById(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.requireRepoOf(workspaceId, pr);
    const gh = await this.githubOrNull('GitHub client unavailable; serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      this.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const pr = await this.pulls.getById(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.requireRepoOf(workspaceId, pr);

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
