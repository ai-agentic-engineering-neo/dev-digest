import type { Container } from '../../platform/container.js';
import type {
  PrMeta,
  PrDetail,
  PrReviewComment,
  PrCommentInput,
  CodeHostClient,
  RepoProvider,
  Finding,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { PullsRepository } from './repository.js';
import { deriveReviewStatus } from './status.js';
import { totalCostByPr } from './total-cost.js';
import { latestBatchReviewsByPr, worstScore } from './latest-batch-reviews.js';

/** Minimal pino-compatible logger — same shape as reviews/run-executor.ts's Logger. */
export type Logger = { warn: (obj: unknown, msg?: string) => void };

// List payload doesn't carry diff stats, so freshly-imported PRs land at
// 0/0/0; backfill from the detail endpoint, capped per request (each backfill
// is a detail fetch) — the periodic refetch chips away at any remainder.
const BACKFILL_LIMIT = 10;

/**
 * F1 — pulls service. PR import via Octokit (list + per-PR detail) + the
 * inline review-comments proxy. No HTTP and no raw SQL live here —
 * persistence goes through PullsRepository.
 */
export class PullsService {
  private repo: PullsRepository;

  constructor(private container: Container) {
    this.repo = new PullsRepository(container.db);
  }

  /**
   * List PRs for a repo (open + recently merged/closed), syncing from the
   * code host when a token is configured — but never failing the read;
   * already-imported/seeded PRs stay viewable offline.
   */
  async listForRepo(workspaceId: string, repoId: string, logger?: Logger): Promise<PrMeta[]> {
    const repo = await this.repo.getRepoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: CodeHostClient | null = null;
    try {
      gh = await this.container.codeHost(repo.provider as RepoProvider);
    } catch (err) {
      logger?.warn({ err }, 'Code-host client unavailable (no token / offline); serving persisted PRs');
    }

    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        await this.repo.upsertFromCodeHost(workspaceId, repo.id, pulls);
      } catch (err) {
        logger?.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await this.repo.listForRepo(repo.id);

    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
          await this.repo.backfillStats(r.id, {
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

    // Latest review BATCH per PR (+ ids, to look up findings below) — powers
    // the list's SCORE ring and FINDINGS column. See latest-batch-reviews.ts
    // for why this is a batch, not just the single newest review row.
    const prIds = rows.map((r) => r.id);
    const reviewRows = await this.repo.latestBatchReviewRows(prIds);
    const latestBatchByPr = latestBatchReviewsByPr(reviewRows);

    // Findings across every review in each PR's latest batch — powers the
    // list's FINDINGS column hover popover ("N FINDINGS IN THIS RUN").
    const latestBatchReviewIds = [...latestBatchByPr.values()].flatMap((list) => list.map((rv) => rv.id));
    const findingRows = await this.repo.findingsForReviews(latestBatchReviewIds);
    const findingsByReviewId = new Map<string, Finding[]>();
    for (const f of findingRows) {
      const list = findingsByReviewId.get(f.reviewId) ?? [];
      list.push({
        id: f.id,
        severity: f.severity as Finding['severity'],
        category: f.category as Finding['category'],
        title: f.title,
        file: f.file,
        start_line: f.startLine,
        end_line: f.endLine,
        rationale: f.rationale,
        suggestion: f.suggestion,
        confidence: f.confidence,
        kind: f.kind as Finding['kind'],
        trifecta_components: f.trifectaComponents as Finding['trifecta_components'],
      });
      findingsByReviewId.set(f.reviewId, list);
    }

    // COST per PR = sum of every completed (`status='done'`) run's cost ever
    // executed against the PR — total spend across its whole review history.
    // See total-cost.ts.
    const rawCostRows = await this.repo.costRows(prIds);
    // numeric column → Drizzle returns a string; totalCostByPr sums as numbers.
    const costRows = rawCostRows.map((r) => ({ ...r, costUsd: r.costUsd != null ? Number(r.costUsd) : null }));
    const costByPr = totalCostByPr(costRows);

    const now = Date.now();
    return rows.map((r) => {
      const batchReviews = latestBatchByPr.get(r.id) ?? [];
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: worstScore(batchReviews.map((rv) => rv.score)),
        cost_usd: costByPr.get(r.id) ?? null,
        findings: batchReviews.flatMap((rv) => findingsByReviewId.get(rv.id) ?? []),
      };
    });
  }

  /**
   * Full PR detail (diff/files, commits, body). Refreshes from the code host
   * when a token is configured; otherwise serves the persisted detail
   * (seeded or previously imported) so the page works offline.
   */
  async getDetail(workspaceId: string, id: string, logger?: Logger): Promise<PrDetail> {
    const pr = await this.repo.getPullInWorkspace(workspaceId, id);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    try {
      const gh = await this.container.codeHost(repo.provider as RepoProvider);
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.repo.refreshDetail(pr.id, detail);
      return { ...detail, id: pr.id };
    } catch (err) {
      logger?.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      const files = await this.repo.getPrFiles(pr.id);
      const commits = await this.repo.getPrCommits(pr.id);
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

  // ---- Inline review comments (Files changed tab) --------------------------
  // Proxied live to the code host (no local persistence): listComments
  // reflects existing PR comments; createComment posts one immediately. Keeps
  // the tab in lock-step with the code host and avoids a stale local mirror.

  private async resolvePrAndRepo(workspaceId: string, id: string) {
    const pr = await this.repo.getPullInWorkspace(workspaceId, id);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  async listComments(workspaceId: string, id: string, logger?: Logger): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, id);
    let gh: CodeHostClient;
    try {
      gh = await this.container.codeHost(repo.provider as RepoProvider);
    } catch (err) {
      logger?.warn({ err }, 'Code-host client unavailable; serving no PR comments');
      return [];
    }
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      logger?.warn({ err }, 'Code-host review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    id: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, id);
    let gh: CodeHostClient;
    try {
      gh = await this.container.codeHost(repo.provider as RepoProvider);
    } catch {
      throw new AppError(
        'code_host_unavailable',
        `Connect a ${repo.provider === 'gitlab' ? 'GitLab' : 'GitHub'} token to post comments.`,
        400,
      );
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
      // The code host rejects comments on lines outside the diff / on closed PRs.
      const msg = err instanceof Error ? err.message : 'Failed to post the comment.';
      throw new AppError('code_host_comment_failed', msg, 400, { cause: String(err) });
    }
  }
}
