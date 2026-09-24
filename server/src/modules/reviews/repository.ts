import type { DbOrTx } from '../../db/client.js';
import type { Finding, FindingRecord, Intent, RunSummary, RunTrace, UnifiedDiff, ActiveRun } from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';
import type * as t from '../../db/schema.js';
import type { AgentSkillsReader, ReviewStore } from './application/ports.js';
import type { StoredReview } from './domain/review.js';
import type { NewAgentRun, NewReview, ReviewSkill, RunCompletion, RunState, RunUsage } from './domain/types.js';
import * as reviewRepo from './repository/review.repo.js';
import * as runRepo from './repository/run.repo.js';
import * as pullRepo from './repository/pull.repo.js';

/**
 * Review data access (infrastructure; implements the ReviewStore port). The
 * ONLY layer touching the DB for the review domain: `reviews`, `findings`,
 * `pr_intent`, and the observability rows `agent_runs` + `run_traces` (one
 * trace doc per run). Workspace scoping is enforced via the PR / run row.
 *
 * Queries are colocated by aggregate under `./repository/` (review+findings,
 * agent runs, pull/intent); row → contract mappers live in `./repository/mappers.ts`.
 * Transactions are opened by the use case through the TransactionRunner port
 * (composition.ts binds a ReviewRepository to the tx handle).
 */
export class ReviewRepository implements ReviewStore, AgentSkillsReader {
  constructor(private db: DbOrTx) {}

  // ---- PR lookup (workspace-scoped) --------------------------------------

  getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    return pullRepo.getPull(this.db, workspaceId, prId);
  }

  getRepo(repoId: string): Promise<typeof t.repos.$inferSelect | undefined> {
    return pullRepo.getRepo(this.db, repoId);
  }

  storedDiff(prId: string): Promise<UnifiedDiff> {
    return pullRepo.storedDiff(this.db, prId);
  }

  /** Record the head SHA a review ran against (PR-list freshness derivation). */
  markReviewed(prId: string, sha: string): Promise<void> {
    return pullRepo.markReviewed(this.db, prId, sha);
  }

  // ---- reviews + findings -------------------------------------------------

  insertReview(values: NewReview): Promise<{ id: string }> {
    return reviewRepo.insertReview(this.db, values);
  }

  insertFindings(reviewId: string, findings: Finding[], skillIds?: ReadonlyMap<string, string>): Promise<FindingRecord[]> {
    return reviewRepo.insertFindings(this.db, reviewId, findings, skillIds);
  }

  /** Reviews for a PR (newest first), each with its findings. */
  reviewsForPull(prId: string): Promise<StoredReview[]> {
    return reviewRepo.reviewsForPull(this.db, prId);
  }

  /** Delete a whole review + its findings (cascade); false if not in the workspace. */
  deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return reviewRepo.deleteReview(this.db, workspaceId, reviewId);
  }

  findingWorkspaceId(findingId: string): Promise<string | undefined> {
    return reviewRepo.findingWorkspaceId(this.db, findingId);
  }

  setFindingAccepted(findingId: string, at: Date | null): Promise<FindingRecord | undefined> {
    return reviewRepo.setFindingAccepted(this.db, findingId, at);
  }

  setFindingDismissed(findingId: string, at: Date | null): Promise<FindingRecord | undefined> {
    return reviewRepo.setFindingDismissed(this.db, findingId, at);
  }

  // ---- intent -------------------------------------------------------------

  upsertIntent(prId: string, intent: Intent): Promise<void> {
    return pullRepo.upsertIntent(this.db, prId, intent);
  }

  getIntent(prId: string): Promise<Intent | undefined> {
    return pullRepo.getIntent(this.db, prId);
  }

  // ---- agent runs + run traces --------------------------------------------

  /** Create an agent_runs row in `running` state; returns its id (= the runId). */
  createAgentRun(values: NewAgentRun): Promise<string> {
    return runRepo.createAgentRun(this.db, values);
  }

  /** agent_run_skills: the skills in the run's prompt at their exact version. */
  recordRunSkills(runId: string, skills: readonly ReviewSkill[]): Promise<void> {
    return runRepo.recordRunSkills(this.db, runId, skills);
  }

  /** The agent's linked, enabled skills in link order (AgentSkillsReader). */
  enabledForAgent(agentId: string): Promise<ReviewSkill[]> {
    return runRepo.enabledSkillsForAgent(this.db, agentId);
  }

  /** In-flight runs for a PR (status='running'), joined with the agent name. */
  activeRunsForPull(workspaceId: string, prId: string): Promise<ActiveRun[]> {
    return runRepo.activeRunsForPull(this.db, workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the PR run history. */
  listRunsForPull(workspaceId: string, prId: string): Promise<RunSummary[]> {
    return runRepo.listRunsForPull(this.db, workspaceId, prId);
  }

  /** Token + USD usage per run id, one query (attached to review records). */
  usageForRuns(runIds: string[]): Promise<Map<string, RunUsage>> {
    return runRepo.usageForRuns(this.db, runIds);
  }

  /** Status of one run in the workspace (undefined = not found there). */
  getRunInWorkspace(workspaceId: string, runId: string): Promise<RunState | undefined> {
    return runRepo.getRunInWorkspace(this.db, workspaceId, runId);
  }

  /** Delete one agent run (+ its trace, review and findings via FK cascade). Workspace-scoped. */
  deleteAgentRun(workspaceId: string, runId: string): Promise<boolean> {
    return runRepo.deleteAgentRun(this.db, workspaceId, runId);
  }

  /** Mark a still-running run as cancelled (no-op if it already finished). */
  cancelRunIfRunning(workspaceId: string, runId: string): Promise<boolean> {
    return runRepo.cancelRunIfRunning(this.db, workspaceId, runId);
  }

  /** Mark a run `done` only if it is still `running`; false = a cancel won. */
  completeAgentRunIfRunning(runId: string, values: RunCompletion): Promise<boolean> {
    return runRepo.completeAgentRunIfRunning(this.db, runId, values);
  }

  /** Record a failed/cancelled run; a run already cancelled stays cancelled. */
  failAgentRun(runId: string, status: 'failed' | 'cancelled', values: RunCompletion): Promise<string | null> {
    return runRepo.failAgentRun(this.db, runId, status, values);
  }

  /** On boot: any run still 'running' is orphaned (its process died), so mark it failed. */
  reapStaleRunningRuns(): Promise<number> {
    return runRepo.reapStaleRunningRuns(this.db);
  }

  /** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
  saveRunTrace(runId: string, trace: RunTrace): Promise<void> {
    return runRepo.saveRunTrace(this.db, runId, trace);
  }

  /** The stored (unvalidated) trace of a run in the workspace. */
  getRunTraceInWorkspace(workspaceId: string, runId: string): Promise<{ trace: unknown } | undefined> {
    return runRepo.getRunTraceInWorkspace(this.db, workspaceId, runId);
  }
}
