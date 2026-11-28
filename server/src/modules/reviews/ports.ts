import type {
  Agent,
  Finding,
  GitClient,
  LLMProvider,
  Provider,
  RunSummary,
  RunTrace,
  UnifiedDiff,
} from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/index.js';
import type { RunEventBus } from '../../platform/run-logger.js';
import type { ReviewDto, ReviewDtoFinding } from './domain.js';

/**
 * A2 — what the review use cases need from the outside world. `routes.ts`
 * wires the real implementations; nothing in the service, the run executor or
 * the diff loader names a concrete class.
 */

/** The pull request under review. The pulls repository's `StoredPull` fits. */
export interface ReviewPull {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  base: string;
  headSha: string;
  body: string | null;
}

export interface RepoRef {
  owner: string;
  name: string;
}

/** Pull requests, owned by the pulls module. */
export interface PullAccess {
  getById(workspaceId: string, id: string): Promise<ReviewPull | undefined>;
  filesAndCommits(pullId: string): Promise<{ files: { path: string; patch?: string | null }[] }>;
  /** Record the head SHA a review ran against (PR-list freshness derivation). */
  markReviewed(pullId: string, sha: string): Promise<void>;
}

/** Repos, owned by the repos module. */
export interface RepoLookup {
  getById(workspaceId: string, id: string): Promise<RepoRef | undefined>;
}

/** Agents, owned by the agents module. */
export interface AgentLookup {
  listEnabled(workspaceId: string): Promise<Agent[]>;
  getById(workspaceId: string, id: string): Promise<Agent | undefined>;
}

export interface NewReview {
  workspaceId: string;
  prId: string;
  agentId: string | null;
  runId: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
}

export interface RunCompletion {
  status: 'done' | 'failed' | 'cancelled';
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  /** USD cost; null when unknown or the run did not complete. */
  costUsd: number | null;
  findingsCount: number;
  grounding: string;
  /** Review score (0-100); null on failed/cancelled runs. */
  score?: number | null;
  /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
  blockers?: number | null;
  /** Failure reason (status='failed') / cancellation note. Null clears it. */
  error?: string | null;
}

/** Everything a successful run stores, saved together or not at all. */
export interface ReviewOutcome {
  runId: string;
  review: NewReview;
  /** The findings that survived grounding. */
  findings: Finding[];
  /** The run's `done` state; `findingsCount` must equal `findings.length`. */
  completion: RunCompletion;
  trace: RunTrace;
}

/** Persistence for reviews, findings, agent runs and run traces. */
export interface ReviewStore {
  /**
   * Save a finished run in one transaction: the review, its findings, the
   * run's completion and its trace. Returns null and saves nothing when the run
   * is no longer `running` (cancelled meanwhile).
   */
  saveReviewOutcome(outcome: ReviewOutcome): Promise<{ reviewId: string } | null>;
  /** Reviews for a PR (newest first), each with its findings; `agent_name` unset. */
  reviewsForPull(prId: string): Promise<ReviewDto[]>;
  /** False when the review is not in the workspace. */
  deleteReview(workspaceId: string, reviewId: string): Promise<boolean>;

  /** The workspace a finding belongs to (through its review), if it exists. */
  findingWorkspace(findingId: string): Promise<string | undefined>;
  setFindingAccepted(findingId: string, at: Date | null): Promise<ReviewDtoFinding | undefined>;
  setFindingDismissed(findingId: string, at: Date | null): Promise<ReviewDtoFinding | undefined>;

  /** In-flight runs for a PR — the server-side source of truth. */
  activeRunsForPull(
    workspaceId: string,
    prId: string,
  ): Promise<{ run_id: string; agent_id: string | null; agent_name: string | null; ran_at: string | null }[]>;
  /** All runs for a PR (any status), newest first. */
  listRunsForPull(workspaceId: string, prId: string): Promise<RunSummary[]>;
  deleteAgentRun(workspaceId: string, runId: string): Promise<boolean>;
  /** A run's status in the workspace; undefined when there is no such run. */
  getRunStatus(workspaceId: string, runId: string): Promise<{ status: string | null } | undefined>;
  /** Mark a still-running run as cancelled (no-op if it already finished). */
  cancelRunIfRunning(runId: string): Promise<boolean>;
  /** Create a run in `running` state; returns its id. */
  createAgentRun(values: {
    workspaceId: string;
    agentId: string | null;
    prId: string;
    provider: string | null;
    model: string | null;
  }): Promise<string>;
  /** Record a terminal state; a no-op unless the run is still `running`. */
  completeAgentRun(runId: string, values: RunCompletion): Promise<void>;
  /** Persist the WHOLE run log as ONE document. */
  saveRunTrace(runId: string, trace: RunTrace): Promise<void>;
  getRunTrace(runId: string): Promise<RunTrace | undefined>;
}

/** A resolver, not an instance: the adapter is built from a key that can change. */
export type LlmResolver = (provider: Provider) => Promise<LLMProvider>;

export type DiffSource = Pick<GitClient, 'diff'>;

/** Parses raw unified-diff text. Pure; injected because it lives with the git adapter. */
export type DiffParser = (raw: string) => UnifiedDiff;

/** The repo-intel facade, as far as a review run uses it. */
export type RepoContext = Pick<RepoIntel, 'getCallerSignatures' | 'getRepoMap' | 'getFileRank'>;

/** The live run stream: publish and buffer (via RunLogger), plus cancel and completion. */
export interface RunEvents extends RunEventBus {
  /** Request cancellation: flags the run and aborts its `signal`. */
  cancel(runId: string): void;
  isCancelled(runId: string): boolean;
  /** Aborted when the run is cancelled; the executor passes it to the LLM call. */
  signal(runId: string): AbortSignal;
  /** Forget a cancellation request and the run's signal; the run executor calls it when a run exits. */
  clearCancelled(runId: string): void;
  complete(runId: string): void;
  /** Whether the bus still holds the run's events (live, or recently completed). */
  has(runId: string): boolean;
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};
