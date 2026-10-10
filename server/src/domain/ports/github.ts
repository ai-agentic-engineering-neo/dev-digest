/** Port — source of truth is server/src/domain/ports (SPEC-16). */
import type {
  PrMeta,
  PrDetail,
  IssueMeta,
  PrReviewComment,
} from '../../vendor/shared/contracts/platform.js';
import type {
  RepoRef,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  OpenPrPayload,
  CommitFilesPayload,
  WorkflowRun,
  RunArtifact,
} from '../../vendor/shared/adapters.js';

export interface GitHubClient {
  listPullRequests(repo: RepoRef): Promise<PrMeta[]>;
  getPullRequest(repo: RepoRef, n: number): Promise<PrDetail>;
  postReview(repo: RepoRef, n: number, review: GitHubReviewPayload): Promise<{ id: string }>;
  /** List inline review comments on a PR (for the "Files changed" tab). */
  listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]>;
  /** Create one inline review comment (or reply) on a PR; returns the new comment. */
  createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment>;
  openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }>;
  /**
   * Commit `files` onto `branch` as ONE atomic commit (Git Data API: blobs →
   * tree → commit → ref). Creates the branch from `base` if missing, else
   * fast-forwards it. Idempotent: re-publishing just adds a new commit.
   */
  commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }>;
  /** The open PR whose head is `branch`, if any (so re-publish reuses it). */
  findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null>;
  getIssue(repo: RepoRef, n: number): Promise<IssueMeta>;
  /** GET /user — for "posting as @user". */
  currentLogin(): Promise<string>;
  /**
   * specs/14-export-to-ci.md — completed (and in-progress) runs of the
   * workflow at `opts.workflowPath` (e.g. `.github/workflows/devdigest.yml`),
   * newest first. Ingestion (AC-17) polls this to discover runs to pull back.
   */
  listWorkflowRuns(
    repo: RepoRef,
    opts: { workflowPath: string; perPage?: number },
  ): Promise<WorkflowRun[]>;
  /** Artifacts published by one workflow run (metadata only). */
  listRunArtifacts(repo: RepoRef, runId: number): Promise<RunArtifact[]>;
  /** Download one artifact's raw zip bytes. */
  downloadArtifact(repo: RepoRef, artifactId: number): Promise<Uint8Array>;
  /**
   * NAMES only, never values — GitHub's own Actions-secrets API never
   * returns a secret's value either way (AC-15, AC-64). Returns `null`,
   * never an empty array or a thrown error, when the credential is not
   * permitted to LIST secrets at all (a 403 on this endpoint — the common
   * case for a fine-grained local-mode PAT lacking `Secrets: read`) — the
   * caller must render that as "unknown", never as "missing" (P-7).
   */
  listRepoSecretNames(repo: RepoRef): Promise<string[] | null>;
}
