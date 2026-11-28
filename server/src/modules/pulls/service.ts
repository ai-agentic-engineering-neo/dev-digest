import type {
  PrCommentInput,
  PrDetail,
  PrFindingsCounts,
  PrMeta,
  PrReviewComment,
} from '@devdigest/shared';
import { BadRequestError, NotFoundError } from '../../platform/errors.js';
import { deriveReviewStatus, pickLatestReviewPerAgent, rollupSeverities } from './domain.js';
import type {
  GitHubResolver,
  Logger,
  PullsGitHub,
  PullStore,
  RepoLookup,
  ReviewRollups,
  StoredPull,
} from './ports.js';

/**
 * F1 — pulls service. PR import from GitHub (list + per-PR detail) and the
 * inline review comments proxy.
 *
 * Local-first: GitHub is synced when a token is configured, but a read never
 * fails because of it — already-imported/seeded PRs stay viewable offline.
 * Review trigger is MANUAL and owned by A2 — this module only imports/reads.
 */

/**
 * Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs land
 * with zeroed size/diff. They are backfilled from the detail endpoint, capped
 * per request (each backfill is a detail fetch).
 */
const BACKFILL_LIMIT = 10;

export interface PullsServiceDeps {
  pulls: PullStore;
  repos: RepoLookup;
  reviews: ReviewRollups;
  github: GitHubResolver;
  log: Logger;
}

export class PullsService {
  constructor(private deps: PullsServiceDeps) {}

  /** PRs for a repo (open + recently merged/closed), synced from GitHub when possible. */
  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const { pulls, repos, github, log } = this.deps;
    const repo = await repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    const ref = { owner: repo.owner, name: repo.name };

    let gh: PullsGitHub | null = null;
    try {
      gh = await github();
    } catch (err) {
      log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    if (gh) {
      try {
        await pulls.upsertFromGitHub(workspaceId, repo.id, await gh.listPullRequests(ref));
      } catch (err) {
        log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const stored = await pulls.listForRepo(repo.id);

    if (gh) {
      const needStats = stored
        .filter((p) => p.additions === 0 && p.deletions === 0 && p.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      for (const p of needStats) {
        try {
          const detail = await gh.getPullRequest(ref, p.number);
          const stats = {
            additions: detail.additions,
            deletions: detail.deletions,
            filesCount: detail.files_count,
          };
          await pulls.setDiffStats(p.id, stats);
          Object.assign(p, stats);
        } catch (err) {
          log.warn({ err, number: p.number }, 'PR diff-stat backfill skipped');
        }
      }
    }

    const prIds = stored.map((p) => p.id);
    const { latestScoreByPr, findingsCountsByPr } = await this.reviewRollups(prIds);
    const totalCostByPr = await this.totalCosts(prIds);

    const now = Date.now();
    return stored.map((p) => ({
      id: p.id,
      number: p.number,
      title: p.title,
      author: p.author,
      branch: p.branch,
      base: p.base,
      head_sha: p.headSha,
      additions: p.additions,
      deletions: p.deletions,
      files_count: p.filesCount,
      status: deriveReviewStatus({
        ghStatus: p.ghStatus,
        lastReviewedSha: p.lastReviewedSha,
        headSha: p.headSha,
        updatedAt: p.updatedAt,
        now,
      }),
      opened_at: p.openedAt?.toISOString() ?? null,
      updated_at: p.updatedAt?.toISOString() ?? null,
      score: latestScoreByPr.has(p.id) ? latestScoreByPr.get(p.id)! : null,
      // Rounded to 10 decimals so float addition noise (0.1 + 0.2) never
      // reaches the client's unrounded hover value.
      total_cost_usd: totalCostByPr.has(p.id)
        ? Math.round(totalCostByPr.get(p.id)! * 1e10) / 1e10
        : null,
      findings_counts: findingsCountsByPr.get(p.id) ?? null,
    }));
  }

  /**
   * Review rollups for the list, computed on read (no FK denorm); the list is
   * small, so IN-queries + grouping here are cheap.
   *  - SCORE ring: the PR's latest review.
   *  - FINDINGS column (M1): findings per severity, summed over each agent's
   *    latest review.
   */
  private async reviewRollups(prIds: string[]) {
    const latestScoreByPr = new Map<string, number | null>();
    const findingsCountsByPr = new Map<string, PrFindingsCounts>();
    if (prIds.length === 0) return { latestScoreByPr, findingsCountsByPr };

    const reviewRefs = await this.deps.reviews.reviewRefsForPulls(prIds);
    // Newest-first → first seen per PR is the latest review.
    for (const rv of reviewRefs) {
      if (!latestScoreByPr.has(rv.prId)) latestScoreByPr.set(rv.prId, rv.score);
    }

    const countedReviews = pickLatestReviewPerAgent(reviewRefs);
    const severitiesByPr = new Map<string, { severity: string }[]>();
    // A reviewed PR with no findings still gets an (all-zero) entry, so the
    // response can tell "reviewed, clean" from "never reviewed" (null).
    for (const prId of countedReviews.values()) severitiesByPr.set(prId, []);
    if (countedReviews.size > 0) {
      const findings = await this.deps.reviews.findingSeverities([...countedReviews.keys()]);
      for (const f of findings) {
        const prId = countedReviews.get(f.reviewId);
        if (prId) severitiesByPr.get(prId)!.push(f);
      }
    }
    for (const [prId, severities] of severitiesByPr) {
      const c = rollupSeverities(severities);
      findingsCountsByPr.set(prId, {
        CRITICAL: c.critical,
        WARNING: c.warning,
        SUGGESTION: c.suggestion,
      });
    }
    return { latestScoreByPr, findingsCountsByPr };
  }

  /**
   * M1 run cost badge: total cost of every agent run on the PR. Only runs with
   * a stored cost count, so a PR with no known cost stays absent from the map
   * and the list shows "—" instead of a fake $0.
   */
  private async totalCosts(prIds: string[]): Promise<Map<string, number>> {
    const totalCostByPr = new Map<string, number>();
    if (prIds.length === 0) return totalCostByPr;
    for (const run of await this.deps.reviews.runCostsForPulls(prIds)) {
      totalCostByPr.set(run.prId, (totalCostByPr.get(run.prId) ?? 0) + run.costUsd);
    }
    return totalCostByPr;
  }

  /** Full PR detail (diff/files, commits, body), refreshed from GitHub when possible. */
  async detail(workspaceId: string, pullId: string): Promise<PrDetail> {
    const { pull, ref } = await this.resolve(workspaceId, pullId);

    // Local-first: refresh detail from GitHub when a token is configured;
    // otherwise serve the persisted files/commits/body (seeded or previously
    // imported) so PR detail works offline.
    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest(ref, pull.number);
      await this.deps.pulls.saveDetail(pull.id, detail);
      return { ...detail, id: pull.id };
    } catch (err) {
      this.deps.log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const { files, commits } = await this.deps.pulls.filesAndCommits(pull.id);
      return {
        id: pull.id,
        number: pull.number,
        title: pull.title,
        author: pull.author,
        branch: pull.branch,
        base: pull.base,
        head_sha: pull.headSha,
        additions: pull.additions,
        deletions: pull.deletions,
        files_count: pull.filesCount,
        status: pull.ghStatus as PrDetail['status'],
        opened_at: pull.openedAt?.toISOString() ?? null,
        updated_at: pull.updatedAt?.toISOString() ?? null,
        body: pull.body ?? null,
        files,
        commits,
      };
    }
  }

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): reading reflects existing PR
  // comments; posting creates one immediately. Keeps the tab in lock-step with
  // GitHub and avoids a stale local mirror.

  async listComments(workspaceId: string, pullId: string): Promise<PrReviewComment[]> {
    const { pull, ref } = await this.resolve(workspaceId, pullId);
    let gh: PullsGitHub;
    try {
      gh = await this.deps.github();
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
      return [];
    }
    try {
      return await gh.listReviewComments(ref, pull.number);
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async addComment(
    workspaceId: string,
    pullId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pull, ref } = await this.resolve(workspaceId, pullId);
    let gh: PullsGitHub;
    try {
      gh = await this.deps.github();
    } catch {
      throw new BadRequestError('github_unavailable', 'Connect a GitHub token to post comments.');
    }
    try {
      return await gh.createReviewComment(ref, pull.number, {
        commitId: pull.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new BadRequestError('github_comment_failed', msg, { cause: String(err) });
    }
  }

  private async resolve(
    workspaceId: string,
    pullId: string,
  ): Promise<{ pull: StoredPull; ref: { owner: string; name: string } }> {
    const pull = await this.deps.pulls.getById(workspaceId, pullId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.deps.repos.getById(workspaceId, pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pull, ref: { owner: repo.owner, name: repo.name } };
  }
}
