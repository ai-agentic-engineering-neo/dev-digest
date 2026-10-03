import type { FastifyBaseLogger } from 'fastify';
import type { Container } from '../../platform/container.js';
import type { GitHubClient, PrCommentInput, PrDetail, PrMeta, PrReviewComment } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { PullsRepository, type PullRow, type RepoRow } from './repository.js';
import {
  buildFindingsBySeverityMap,
  buildLatestReviewMap,
  buildRunCostMap,
  latestReviewIdsPerAgent,
  toPrMetaDto,
} from './helpers.js';

/** Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs land
 *  zeroed; backfill is capped per request (each row is its own detail fetch). */
const BACKFILL_LIMIT = 10;

/**
 * F1 — pulls service. Orchestrates the GitHub-PR sync (list import + diff-stat
 * backfill), the PR-list rollups (score/findings/cost), and PR detail/comments.
 * All persistence goes through PullsRepository; polling/service.ts reuses
 * `syncFromGitHub` so the sync logic exists in exactly one place.
 */
export class PullsService {
  private repo: PullsRepository;

  constructor(private container: Container) {
    this.repo = new PullsRepository(container.db);
  }

  async findRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** Best-effort GitHub client resolve — never throws; callers degrade to
   *  serving already-persisted data when no token is configured / offline. */
  private async tryGithub(logger?: FastifyBaseLogger): Promise<GitHubClient | null> {
    try {
      return await this.container.github();
    } catch (err) {
      logger?.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted data');
      return null;
    }
  }

  /**
   * Sync a repo's PR list from GitHub (idempotent batched upsert). Shared by
   * the `/repos/:id/pulls` list read (best-effort refresh) and the manual
   * `/repos/:id/poll` sync (polling/service.ts) — the ONE place this logic
   * lives, so it can't drift between the two callers.
   */
  async syncFromGitHub(
    gh: GitHubClient,
    workspaceId: string,
    repo: RepoRow,
  ): Promise<number> {
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    await this.repo.upsertFromGitHub(workspaceId, repo.id, pulls);
    return pulls.length;
  }

  /** Backfill missing diff stats for PRs that imported with zeroed size (each
   *  row needs its own GitHub detail fetch, so this stays per-row). */
  private async backfillDiffStats(
    gh: GitHubClient,
    repo: RepoRow,
    rows: PullRow[],
    logger?: FastifyBaseLogger,
  ): Promise<void> {
    const needStats = rows
      .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
      .slice(0, BACKFILL_LIMIT);
    for (const r of needStats) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
        await this.repo.updateDiffStats(r.id, {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        });
        r.additions = detail.additions;
        r.deletions = detail.deletions;
        r.filesCount = detail.files_count;
      } catch (err) {
        logger?.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  /**
   * GET /repos/:id/pulls — local-first: sync from GitHub when a token is
   * configured (never fails the read), then roll up score/findings/cost per PR.
   */
  async listForRepo(workspaceId: string, repoId: string, logger?: FastifyBaseLogger): Promise<PrMeta[]> {
    const repo = await this.findRepo(workspaceId, repoId);
    const gh = await this.tryGithub(logger);

    if (gh) {
      try {
        await this.syncFromGitHub(gh, workspaceId, repo);
      } catch (err) {
        logger?.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.repo.listByRepo(repo.id);

    if (gh) await this.backfillDiffStats(gh, repo, rows, logger);

    const prIds = rows.map((r) => r.id);

    const latestReviewByPr =
      prIds.length > 0
        ? buildLatestReviewMap(await this.repo.latestReviewRowsForPrs(prIds))
        : new Map<string, { id: string; score: number | null }>();

    let findingsBySeverityByPr = new Map<string, Record<string, number>>();
    if (prIds.length > 0) {
      const reviewRows = await this.repo.reviewAgentRowsForPrs(prIds);
      const latestPerAgentReviewIds = latestReviewIdsPerAgent(reviewRows);
      if (latestPerAgentReviewIds.length > 0) {
        const countRows = await this.repo.findingsCountsForReviewIds(latestPerAgentReviewIds);
        findingsBySeverityByPr = buildFindingsBySeverityMap(countRows);
      }
    }

    const totalRunCostByPr =
      prIds.length > 0
        ? buildRunCostMap(await this.repo.runCostRowsForPrs(prIds))
        : new Map<string, number>();

    const now = Date.now();
    return rows.map((r) =>
      toPrMetaDto(
        r,
        latestReviewByPr.get(r.id),
        totalRunCostByPr.get(r.id),
        findingsBySeverityByPr.get(r.id),
        now,
      ),
    );
  }

  /** GET /pulls/:id — local-first PR detail (refresh from GitHub when possible). */
  async getDetail(workspaceId: string, prId: string, logger?: FastifyBaseLogger): Promise<PrDetail> {
    const pr = await this.repo.getById(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);

      await this.repo.replacePrFiles(pr.id, detail.files);
      await this.repo.replacePrCommits(pr.id, detail.commits);
      await this.repo.updateDetail(pr.id, {
        body: detail.body ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });

      return { ...detail, id: pr.id };
    } catch (err) {
      logger?.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const files = await this.repo.listPrFiles(pr.id);
      const commits = await this.repo.listPrCommits(pr.id);
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
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  }

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): GET reflects existing PR
  // comments; POST creates one immediately. Keeps the tab in lock-step with
  // GitHub and avoids a stale local mirror.

  private async resolvePrAndRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: PullRow; repo: RepoRow }> {
    const pr = await this.repo.getById(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  async listComments(
    workspaceId: string,
    prId: string,
    logger?: FastifyBaseLogger,
  ): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch (err) {
      logger?.warn({ err }, 'GitHub client unavailable; serving no PR comments');
      return [];
    }
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      logger?.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async postComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
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
