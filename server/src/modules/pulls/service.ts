import type {
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { DIFF_STAT_BACKFILL_LIMIT } from './constants.js';
import { type PullRepository, type StoredPull } from './repository.js';
import { deriveReviewStatus } from './status.js';

/**
 * Pulls use cases: sync a repo's PR list, read one PR, proxy inline comments.
 * GitHub is best-effort on reads (local-first). Writes to GitHub fail closed.
 */

export interface PullsLog {
  warn(bindings: Record<string, unknown>, msg: string): void;
}

export interface PullsServiceDeps {
  store: PullRepository;
  github: () => Promise<GitHubClient>;
  log: PullsLog;
  now?: () => number;
}

export class PullsService {
  constructor(private deps: PullsServiceDeps) {}

  async list(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const repo = await this.deps.store.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.githubOrNull('GitHub client unavailable (no token / offline); serving persisted PRs');
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        await this.deps.store.upsertFromList(workspaceId, repo.id, pulls);
      } catch (err) {
        this.deps.log.warn(
          { err },
          'GitHub PR sync skipped (no token / offline); serving persisted PRs',
        );
      }
    }

    const rows = await this.deps.store.listByRepo(workspaceId, repo.id);
    if (gh) await this.backfillDiffStats(gh, repo, rows);

    const prIds = rows.map((row) => row.id);
    const [scores, costs] = await Promise.all([
      this.deps.store.latestReviewScoreByPr(workspaceId, prIds),
      this.deps.store.sumCostByPr(workspaceId, prIds),
    ]);
    const now = (this.deps.now ?? Date.now)();
    return rows.map((row) => this.toMeta(row, scores, costs, now));
  }

  async get(workspaceId: string, prId: string): Promise<PrDetail> {
    const pr = await this.deps.store.findPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.deps.store.findRepo(workspaceId, pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.deps.store.replaceFiles(pr.id, detail.files);
      await this.deps.store.replaceCommits(pr.id, detail.commits);
      await this.deps.store.updateDetail(pr.id, {
        body: detail.body ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });
      return { ...detail, id: pr.id };
    } catch (err) {
      this.deps.log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const [files, commits] = await Promise.all([
        this.deps.store.listFiles(pr.id),
        this.deps.store.listCommits(pr.id),
      ]);
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files,
        commits,
      };
    }
  }

  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    const gh = await this.githubOrNull('GitHub client unavailable; serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
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
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }

  private async resolvePrAndRepo(workspaceId: string, prId: string) {
    const pr = await this.deps.store.findPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.deps.store.findRepo(workspaceId, pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  private async githubOrNull(message: string): Promise<GitHubClient | null> {
    try {
      return await this.deps.github();
    } catch (err) {
      this.deps.log.warn({ err }, message);
      return null;
    }
  }

  private async backfillDiffStats(
    gh: GitHubClient,
    repo: { owner: string; name: string },
    rows: StoredPull[],
  ): Promise<void> {
    const needStats = rows
      .filter((row) => row.additions === 0 && row.deletions === 0 && row.filesCount === 0)
      .slice(0, DIFF_STAT_BACKFILL_LIMIT);
    for (const row of needStats) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, row.number);
        await this.deps.store.updateDiffStats(row.id, {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        });
        row.additions = detail.additions;
        row.deletions = detail.deletions;
        row.filesCount = detail.files_count;
      } catch (err) {
        this.deps.log.warn({ err, number: row.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  private toMeta(
    row: StoredPull,
    scores: Map<string, number | null>,
    costs: Map<string, number | null>,
    now: number,
  ): PrMeta {
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      author: row.author,
      branch: row.branch,
      base: row.base,
      head_sha: row.headSha,
      additions: row.additions,
      deletions: row.deletions,
      files_count: row.filesCount,
      status: deriveReviewStatus({
        ghStatus: row.status,
        lastReviewedSha: row.lastReviewedSha,
        headSha: row.headSha,
        updatedAt: row.updatedAt,
        now,
      }),
      opened_at: row.openedAt?.toISOString() ?? null,
      updated_at: row.updatedAt?.toISOString() ?? null,
      score: scores.has(row.id) ? scores.get(row.id)! : null,
      cost_usd: costs.get(row.id) ?? null,
    };
  }
}
