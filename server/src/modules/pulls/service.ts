import type {
  GitHubClient,
  PrCommentInput,
  PrDetail,
  PrMeta,
  PrReviewComment,
} from '@devdigest/shared';
import type { TransactionRunner } from '../../application/transaction.js';
import { InvalidInputError, NotFoundError } from '../../platform/errors.js';
import type { PullsRepository } from './repository.js';
import { BACKFILL_LIMIT } from './constants.js';
import { needsDiffStats, toPersistedPrDetail, toPrListItem, type PullRecord, type RepoCoords } from './domain.js';

/** Request-scoped logger (pino / `req.log` compatible). */
export interface Logger {
  warn(obj: Record<string, unknown>, msg: string): void;
}

/** Runs tasks with bounded concurrency (GitHub-friendly), resolving in order. */
export type BoundedRunner = <T>(tasks: Array<() => Promise<T>>) => Promise<T[]>;

export interface PullsServiceDeps {
  pulls: Pick<
    PullsRepository,
    | 'findRepo'
    | 'findRepoById'
    | 'findPull'
    | 'listForRepo'
    | 'upsertListed'
    | 'setDiffStats'
    | 'listFiles'
    | 'listCommits'
    | 'rollups'
  >;
  /** Resolves the GitHub client; rejects when no token is configured. */
  github: () => Promise<GitHubClient>;
  /** Transaction-bound repositories for the PR-detail mirror. */
  tx: TransactionRunner<{ pulls: Pick<PullsRepository, 'replaceFiles' | 'replaceCommits' | 'setDetailFields'> }>;
  /** Bounded-concurrency runner for the diff-stat backfill. */
  runBounded: BoundedRunner;
  now?: () => number;
}

/**
 * F1 — pulls use cases. PR import via the GitHub port (list + per-PR detail),
 * local-first: GitHub is refreshed when a token is configured, but reads never
 * fail on it — already-imported/seeded PRs stay viewable offline.
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL and
 * owned by the reviews module — this module only imports/reads.
 */
export class PullsService {
  constructor(private readonly deps: PullsServiceDeps) {}

  /** GET /repos/:id/pulls — sync from GitHub, backfill diff stats, add rollups. */
  async listForRepo(workspaceId: string, repoId: string, log: Logger): Promise<PrMeta[]> {
    const repo = await this.deps.pulls.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.tryGithub(log, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    if (gh) {
      try {
        const listed = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        await this.deps.pulls.upsertListed(workspaceId, repo.id, listed);
      } catch (err) {
        log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const pulls = await this.deps.pulls.listForRepo(repo.id);
    if (gh) await this.backfillDiffStats(gh, repo, pulls, log);

    const rollups = await this.deps.pulls.rollups(workspaceId, pulls.map((p) => p.id));
    const now = (this.deps.now ?? Date.now)();
    return pulls.map((p) => toPrListItem(p, rollups.get(p.id), now));
  }

  /** Import GitHub's PR-list payload for a repo (one multi-row upsert). Used by polling. */
  async importListed(workspaceId: string, repoId: string, listed: PrMeta[]): Promise<number> {
    await this.deps.pulls.upsertListed(workspaceId, repoId, listed);
    return listed.length;
  }

  /**
   * GET /pulls/:id — refresh detail from GitHub and mirror files/commits
   * atomically (upsert + delete-missing, so a concurrent reader never sees an
   * empty PR); on any failure serve the persisted mirror.
   */
  async getDetail(workspaceId: string, prId: string, log: Logger): Promise<PrDetail> {
    const { pr, repo } = await this.resolvePull(workspaceId, prId);
    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.deps.tx.run(async ({ pulls }) => {
        await pulls.replaceFiles(pr.id, detail.files);
        await pulls.replaceCommits(pr.id, detail.commits);
        await pulls.setDetailFields(pr.id, {
          body: detail.body ?? null,
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        });
      });
      return { ...detail, id: pr.id };
    } catch (err) {
      log.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      const [files, commits] = await Promise.all([
        this.deps.pulls.listFiles(pr.id),
        this.deps.pulls.listCommits(pr.id),
      ]);
      return toPersistedPrDetail(pr, files, commits);
    }
  }

  /** GET /pulls/:id/comments — proxied live to GitHub; [] when unavailable. */
  async listComments(workspaceId: string, prId: string, log: Logger): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePull(workspaceId, prId);
    const gh = await this.tryGithub(log, 'GitHub client unavailable; serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  /** POST /pulls/:id/comments — create one inline comment, pinned to the PR head. */
  async createComment(workspaceId: string, prId: string, input: PrCommentInput): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePull(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch {
      throw new InvalidInputError('Connect a GitHub token to post comments.', undefined, 'github_unavailable');
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
      throw new InvalidInputError(msg, { cause: String(err) }, 'github_comment_failed');
    }
  }

  private async resolvePull(workspaceId: string, prId: string): Promise<{ pr: PullRecord; repo: RepoCoords }> {
    const pr = await this.deps.pulls.findPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.deps.pulls.findRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  private async tryGithub(log: Logger, msg: string): Promise<GitHubClient | null> {
    try {
      return await this.deps.github();
    } catch (err) {
      log.warn({ err }, msg);
      return null;
    }
  }

  /**
   * Diff stats aren't on GitHub's PR-list payload, so freshly imported PRs land
   * with zeroed size/diff. Backfill them from the detail endpoint, capped per
   * request (BACKFILL_LIMIT — the periodic refetch does the rest) and with
   * bounded concurrency. Mutates `pulls` so the response shows the new stats.
   */
  private async backfillDiffStats(
    gh: GitHubClient,
    repo: RepoCoords,
    pulls: PullRecord[],
    log: Logger,
  ): Promise<void> {
    const pending = pulls.filter(needsDiffStats).slice(0, BACKFILL_LIMIT);
    await this.deps.runBounded(
      pending.map((pr) => async () => {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
          const stats = { additions: detail.additions, deletions: detail.deletions, filesCount: detail.files_count };
          await this.deps.pulls.setDiffStats(pr.id, stats);
          Object.assign(pr, stats);
        } catch (err) {
          log.warn({ err, number: pr.number }, 'PR diff-stat backfill skipped');
        }
      }),
    );
  }
}
