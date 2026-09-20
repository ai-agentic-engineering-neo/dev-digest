import type { GitHubClient, PrMeta, PrDetail, PrReviewComment, PrCommentInput } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { deriveReviewStatus, type SeverityCounts } from './status.js';
import { BACKFILL_LIMIT } from './constants.js';
import { computeScoreAndVerdictByPr, computeFindingsByPr, computeCostByPr, toPrMetaDto } from './helpers.js';
import type { PullsRepo, RepoRef, PullRecord } from './types.js';

/** Structural logger — services never import Fastify's `FastifyBaseLogger`. */
export type Logger = {
  warn: (obj: unknown, msg?: string) => void;
};

export interface PullsServiceDeps {
  repo: PullsRepo;
  github: () => Promise<GitHubClient>;
}

/**
 * Pulls module application service (ring 3). Takes explicit `deps` (a repo
 * port + a github() factory) rather than the whole `Container` — unlike the
 * `agents`/`reviews` exemplars, which still take `Container` as tracked
 * baseline debt (see `.claude/skills/onion-architecture` "Documented
 * compromises"). New code should not repeat that pattern.
 */
export class PullsService {
  constructor(private deps: PullsServiceDeps) {}

  /**
   * `GET /repos/:id/pulls`: sync from GitHub (best-effort — never fails the
   * read; already-imported/seeded PRs stay viewable offline), backfill
   * missing diff stats, then roll up score/status/findings/cost per PR.
   */
  async listForRepo(workspaceId: string, repoId: string, logger?: Logger): Promise<PrMeta[]> {
    const repo = await this.deps.repo.getRepoForWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await this.deps.github();
    } catch (err) {
      logger?.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await this.deps.repo.upsertPullRequestFromList(workspaceId, repo.id, pr);
        }
      } catch (err) {
        logger?.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.deps.repo.listPullsForRepo(repo.id);

    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
          await this.deps.repo.updatePullDiffStats(r.id, {
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

    const prIds = rows.map((r) => r.id);
    let scoreByPr = new Map<string, number | null>();
    let worstVerdictByPr = new Map<string, string | null>();
    let findingsByPr = new Map<string, SeverityCounts>();
    if (prIds.length > 0) {
      const reviewRows = await this.deps.repo.reviewRollupForPulls(prIds);
      const agg = computeScoreAndVerdictByPr(reviewRows);
      scoreByPr = agg.scoreByPr;
      worstVerdictByPr = agg.worstVerdictByPr;
      if (agg.latestReviewIds.length > 0) {
        const findingRows = await this.deps.repo.findingSeveritiesForReviewIds(agg.latestReviewIds);
        findingsByPr = computeFindingsByPr(findingRows, agg.prIdsWithLatestReview);
      }
    }

    let costByPr = new Map<string, number | null>();
    if (prIds.length > 0) {
      const runRows = await this.deps.repo.completedRunCostsForPulls(prIds);
      costByPr = computeCostByPr(runRows);
    }

    const now = Date.now();
    return rows.map((r) =>
      toPrMetaDto(r, {
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
          worstVerdict: worstVerdictByPr.get(r.id) ?? null,
        }),
        score: scoreByPr.get(r.id) ?? null,
        cost: costByPr.get(r.id) ?? null,
        findings: findingsByPr.get(r.id) ?? null,
      }),
    );
  }

  /**
   * Raw sync core, no graceful degrade — a missing GitHub token propagates
   * (matches the manual `poll` endpoint's historical behavior, unlike the
   * best-effort sync inside `listForRepo`).
   */
  async syncFromGitHub(workspaceId: string, repoId: string): Promise<{ repo: RepoRef; count: number }> {
    const repo = await this.deps.repo.getRepoForWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const gh = await this.deps.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    for (const pr of pulls) {
      await this.deps.repo.upsertPullRequestFromList(workspaceId, repo.id, pr, { setOpenedAt: false });
    }
    return { repo, count: pulls.length };
  }

  /** `POST /repos/:id/poll`: sync PR list only, bump `last_polled_at`. No review is triggered — manual trigger only. */
  async pollRepo(workspaceId: string, repoId: string): Promise<{ synced: number; reviewTriggered: false }> {
    const { repo, count } = await this.syncFromGitHub(workspaceId, repoId);
    await this.deps.repo.touchRepoPolledAt(repo.id);
    return { synced: count, reviewTriggered: false };
  }

  /** `GET /pulls/:id`: refresh from GitHub when possible, else serve the persisted detail. */
  async getDetail(workspaceId: string, pullId: string, logger?: Logger): Promise<PrDetail> {
    const pr = await this.deps.repo.getPullForWorkspace(workspaceId, pullId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.deps.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.deps.repo.replacePrFilesAndCommits(pr.id, detail.files, detail.commits);
      await this.deps.repo.updatePullDetail(pr.id, {
        body: detail.body ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      });
      return { ...detail, id: pr.id };
    } catch (err) {
      logger?.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      const { files, commits } = await this.deps.repo.getPrFilesAndCommits(pr.id);
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
        files: files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions, patch: f.patch ?? null })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  }

  private async resolvePrAndRepo(workspaceId: string, pullId: string): Promise<{ pr: PullRecord; repo: RepoRef }> {
    const pr = await this.deps.repo.getPullForWorkspace(workspaceId, pullId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.deps.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  /** Inline review comments (Files changed tab) — proxied live to GitHub, no local persistence. */
  async listComments(workspaceId: string, pullId: string, logger?: Logger): Promise<PrReviewComment[]> {
    const { repo, pr } = await this.resolvePrAndRepo(workspaceId, pullId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
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

  async postComment(workspaceId: string, pullId: string, input: PrCommentInput): Promise<PrReviewComment> {
    const { repo, pr } = await this.resolvePrAndRepo(workspaceId, pullId);
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
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }
}
