import type {
  Finding,
  GitClient,
  LLMProvider,
  Provider,
  RunEvent,
  RunEventKind,
  RunLogLine,
  RunSummary,
  RunTrace,
  UnifiedDiff,
} from '@devdigest/shared';
import type {
  ActiveRun,
  AgentRunCompletion,
  NewAgentRun,
  NewReview,
  PrFilePatch,
  PullRequest,
  RepoCoordinates,
  Review,
  ReviewAgent,
  ReviewFinding,
} from './types.js';

/** Persistence port for reviews, findings, agent runs and their traces. */
export interface ReviewsRepository {
  // ---- PR lookup (workspace-scoped) ----
  getPull(workspaceId: string, prId: string): Promise<PullRequest | undefined>;
  getRepo(repoId: string): Promise<RepoCoordinates | undefined>;
  getPrFiles(prId: string): Promise<PrFilePatch[]>;
  /** Record the head SHA a review ran against (PR-list freshness). */
  markReviewed(prId: string, sha: string): Promise<void>;

  // ---- reviews + findings ----
  insertReview(values: NewReview): Promise<Review>;
  insertFindings(reviewId: string, findings: Finding[]): Promise<ReviewFinding[]>;
  /** Reviews for a PR (newest first), each with its findings. */
  reviewsForPull(prId: string): Promise<{ review: Review; findings: ReviewFinding[] }[]>;
  /** False if the review is not in the workspace. Findings cascade. */
  deleteReview(workspaceId: string, reviewId: string): Promise<boolean>;
  /** A finding with the review and PR it belongs to (for workspace scoping). */
  findingContext(
    findingId: string,
  ): Promise<{ finding: ReviewFinding; review: Review; pull: PullRequest } | undefined>;
  setFindingAccepted(findingId: string, at: Date | null): Promise<ReviewFinding | undefined>;
  setFindingDismissed(findingId: string, at: Date | null): Promise<ReviewFinding | undefined>;

  // ---- agent runs + run traces ----
  /** Creates the run in `running` state; returns its id (= the runId). */
  createAgentRun(values: NewAgentRun): Promise<string>;
  completeAgentRun(runId: string, values: AgentRunCompletion): Promise<void>;
  activeRunsForPull(workspaceId: string, prId: string): Promise<ActiveRun[]>;
  /** All runs for a PR (any status), newest first. */
  listRunsForPull(workspaceId: string, prId: string): Promise<RunSummary[]>;
  deleteAgentRun(workspaceId: string, runId: string): Promise<boolean>;
  /** No-op (false) when the run already finished. */
  cancelRunIfRunning(runId: string): Promise<boolean>;
  /** Marks runs orphaned by a dead process as failed; returns how many. */
  reapStaleRunningRuns(): Promise<number>;
  saveRunTrace(runId: string, trace: RunTrace): Promise<void>;
  getRunTrace(runId: string): Promise<RunTrace | undefined>;
}

/** Agents port: which agents to run (backed by container.agentsRepo). */
export interface AgentsReader {
  listEnabled(workspaceId: string): Promise<ReviewAgent[]>;
  getById(workspaceId: string, id: string): Promise<ReviewAgent | undefined>;
}

/**
 * The three repo-intel reads a review uses for prompt context. Satisfied
 * structurally by the repo-intel facade (container.repoIntel); every call may
 * degrade to empty and must never fail a run.
 */
export interface ReviewContextSource {
  getCallerSignatures(
    repoId: string,
    changedFiles: string[],
    limit?: number,
  ): Promise<{ file: string; symbol: string; signature: string }[]>;
  getRepoMap(repoId: string): Promise<{ degraded?: boolean; text: string; tokens: number; cached: boolean }>;
  getFileRank(repoId: string, paths: string[]): Promise<{ percentile: number }[]>;
}

/** Live run events (the in-memory RunBus in platform/sse.ts satisfies it). */
export interface RunEvents {
  publish(runId: string, kind: RunEventKind, msg: string, data?: unknown): unknown;
  /** Ask a live run to stop at its next checkpoint. */
  cancel(runId: string): void;
  isCancelled(runId: string): boolean;
  /** End the run's stream. */
  complete(runId: string): void;
  /** Every event published for the run so far. */
  buffer(runId: string): RunEvent[];
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

/**
 * A run's log sink: streams to the Live Log, buffers for the trace and mirrors
 * to stdout (platform/run-logger.ts RunLogger satisfies it). One instance may
 * fan out to several runs; `forRun` narrows it to one.
 */
export interface RunLog {
  forRun(runId: string, ctx?: Record<string, unknown>): RunLog;
  event(kind: RunEventKind, msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  tool(msg: string, data?: unknown): void;
  result(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  /** Time an async step: logs start, done/failed with duration; rethrows. */
  step<T>(label: string, fn: () => Promise<T>, opts?: { kind?: RunEventKind; data?: unknown }): Promise<T>;
  /** The run's buffered events as persisted log lines. */
  logFor(runId: string): RunLogLine[];
}

/** Opens a run log over `runIds` (fan-out), mirrored to `logger` with `ctx`. */
export type RunLogFactory = (runIds: string[], logger?: Logger, ctx?: Record<string, unknown>) => RunLog;

/** Parses unified-diff text (the git adapter's parser). */
export type DiffParser = (raw: string) => UnifiedDiff;

/** What a background review run needs — never the Container itself. */
export interface ReviewRunDeps {
  repo: ReviewsRepository;
  runBus: RunEvents;
  openRunLog: RunLogFactory;
  parseDiff: DiffParser;
  llmFor: (provider: Provider) => Promise<LLMProvider>;
  repoIntel: ReviewContextSource;
  git: Pick<GitClient, 'diff'>;
}

/** Built in platform/container.ts (`container.reviewService`). */
export interface ReviewDeps extends ReviewRunDeps {
  agents: AgentsReader;
}
