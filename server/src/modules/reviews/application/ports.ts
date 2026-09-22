/**
 * Ports of the reviews use cases. Infrastructure implements them
 * (repository.ts → ReviewStore); the composition root wires the real ones and
 * tests pass in-memory fakes.
 */
import type {
  ActiveRun,
  Finding,
  FindingRecord,
  GitClient,
  LLMProvider,
  Provider,
  RunSummary,
  RunTrace,
  UnifiedDiff,
} from '@devdigest/shared';
import type { TransactionRunner } from '../../../application/transaction.js';
import type { PinoLike } from '../../../platform/run-logger.js';
import type { RepoIntel } from '../../repo-intel/types.js';
import type { StoredReview } from '../domain/review.js';
import type {
  NewAgentRun,
  NewReview,
  ReviewAgent,
  ReviewPull,
  ReviewRepo,
  RunCompletion,
  RunState,
  RunUsage,
  ReviewSkill,
} from '../domain/types.js';

/** Minimal pino-compatible logger: (obj, msg). */
export type Logger = PinoLike;

/** Writes of one review run that must commit together (see ReviewTx). */
export interface ReviewWrites {
  insertReview(values: NewReview): Promise<{ id: string }>;
  /** `skillIds` resolves each finding's cited `skill` name to findings.skill_id. */
  insertFindings(reviewId: string, findings: Finding[], skillIds?: ReadonlyMap<string, string>): Promise<FindingRecord[]>;
  /** Record the head SHA a review ran against (PR-list freshness). */
  markReviewed(prId: string, sha: string): Promise<void>;
  /** Mark a run `done` only if it is still `running`; false = a cancel won. */
  completeAgentRunIfRunning(runId: string, values: RunCompletion): Promise<boolean>;
}

/** Review persistence: PRs, reviews, findings, agent runs and their traces. */
export interface ReviewStore extends ReviewWrites {
  getPull(workspaceId: string, prId: string): Promise<ReviewPull | undefined>;
  getRepo(repoId: string): Promise<ReviewRepo | undefined>;
  /** The PR diff rebuilt from the persisted pr_files patches. */
  storedDiff(prId: string): Promise<UnifiedDiff>;

  reviewsForPull(prId: string): Promise<StoredReview[]>;
  deleteReview(workspaceId: string, reviewId: string): Promise<boolean>;
  /** Workspace of the PR a finding belongs to (undefined = no such finding). */
  findingWorkspaceId(findingId: string): Promise<string | undefined>;
  setFindingAccepted(findingId: string, at: Date): Promise<FindingRecord | undefined>;
  setFindingDismissed(findingId: string, at: Date): Promise<FindingRecord | undefined>;

  createAgentRun(values: NewAgentRun): Promise<string>;
  /** agent_run_skills: the skills (at their exact version) in the run's prompt, in order. */
  recordRunSkills(runId: string, skills: readonly ReviewSkill[]): Promise<void>;
  activeRunsForPull(workspaceId: string, prId: string): Promise<ActiveRun[]>;
  listRunsForPull(workspaceId: string, prId: string): Promise<RunSummary[]>;
  usageForRuns(runIds: string[]): Promise<Map<string, RunUsage>>;
  getRunInWorkspace(workspaceId: string, runId: string): Promise<RunState | undefined>;
  deleteAgentRun(workspaceId: string, runId: string): Promise<boolean>;
  cancelRunIfRunning(workspaceId: string, runId: string): Promise<boolean>;
  /** Record a failed/cancelled run; a run already cancelled stays cancelled. */
  failAgentRun(runId: string, status: 'failed' | 'cancelled', values: RunCompletion): Promise<string | null>;
  reapStaleRunningRuns(): Promise<number>;
  saveRunTrace(runId: string, trace: RunTrace): Promise<void>;
  /** The stored (unvalidated) trace of a run in the workspace. */
  getRunTraceInWorkspace(workspaceId: string, runId: string): Promise<{ trace: unknown } | undefined>;
}

/** The persist step of a run: review + findings + terminal status, atomically. */
export type ReviewTx = TransactionRunner<{ reviews: ReviewWrites }>;

/** Agents as the reviews module sees them. */
export interface AgentDirectory {
  listEnabled(workspaceId: string): Promise<ReviewAgent[]>;
  getById(workspaceId: string, id: string): Promise<ReviewAgent | undefined>;
  namesByIds(workspaceId: string, ids: string[]): Promise<Map<string, string>>;
}

/** The agent's linked skills a review prompt carries. */
export interface AgentSkillsReader {
  /** Linked AND enabled skills, in the agent's link order. */
  enabledForAgent(agentId: string): Promise<ReviewSkill[]>;
}

/** Repo-intel reads a review prompt is enriched with (all degrade, never throw by contract). */
export type RepoContext = Pick<RepoIntel, 'getCallerSignatures' | 'getRepoMap' | 'getFileRank'>;

/** Resolve an agent's LLM provider (throws a ConfigError when its key is missing). */
export type LlmResolver = (provider: Provider) => Promise<LLMProvider>;

export type DiffSource = Pick<GitClient, 'diff'>;

/** Wall clock (injectable for tests). */
export type Clock = () => Date;
