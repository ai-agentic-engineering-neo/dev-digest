import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Finding, Intent, RunSummary, RunTrace } from '@devdigest/shared';

/**
 * A2 — review data-access. The ONLY layer touching the DB for the review
 * domain. Owns `reviews`, `findings`, `pr_intent`, and persists the
 * observability rows `agent_runs` + `run_traces` (one trace doc per run).
 * Pull requests belong to the pulls module (see ports.ts `PullAccess`).
 *
 * Rows stop here: every method returns a contract or a domain.ts type.
 *
 * The query implementations are colocated, split by aggregate, under
 * `./repository/` (review+findings, agent runs, pull/intent). This class
 * composes them so its public API stays identical.
 */

import * as reviewRepo from './repository/review.repo.js';
import * as runRepo from './repository/run.repo.js';
import * as pullRepo from './repository/pull.repo.js';
import type { ReviewDto, ReviewDtoFinding } from './domain.js';
import type { NewReview, ReviewStore, RunCompletion } from './ports.js';

export class ReviewRepository implements ReviewStore {
  constructor(private db: Db) {}

  // ---- reviews + findings -------------------------------------------------

  insertReview(values: NewReview): Promise<{ id: string }> {
    return reviewRepo.insertReview(this.db, values);
  }

  /** Returns how many findings were stored. */
  insertFindings(reviewId: string, findings: Finding[]): Promise<number> {
    return reviewRepo.insertFindings(this.db, reviewId, findings);
  }

  /** Reviews for a PR (newest first), each with its findings. */
  reviewsForPull(prId: string): Promise<ReviewDto[]> {
    return reviewRepo.reviewsForPull(this.db, prId);
  }

  /** In-flight runs for a PR (status='running') — the server-side source of
   *  truth for "which agents are running now". Joined with the agent name. */
  activeRunsForPull(
    workspaceId: string,
    prId: string,
  ): Promise<{ run_id: string; agent_id: string | null; agent_name: string | null; ran_at: string | null }[]> {
    return runRepo.activeRunsForPull(this.db, workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the PR run history. */
  listRunsForPull(workspaceId: string, prId: string): Promise<RunSummary[]> {
    return runRepo.listRunsForPull(this.db, workspaceId, prId);
  }

  /** Delete one agent run (+ its trace via FK cascade). Workspace-scoped. */
  deleteAgentRun(workspaceId: string, runId: string): Promise<boolean> {
    return runRepo.deleteAgentRun(this.db, workspaceId, runId);
  }

  /** Mark a still-running run as cancelled (no-op if it already finished). */
  cancelRunIfRunning(runId: string): Promise<boolean> {
    return runRepo.cancelRunIfRunning(this.db, runId);
  }

  /** On boot: any run still 'running' is orphaned (its process died / restarted),
   *  so mark it failed. Prevents permanently stuck "running" runs in the UI. */
  reapStaleRunningRuns(): Promise<number> {
    return runRepo.reapStaleRunningRuns(this.db);
  }

  /** Delete a whole review (one agent's run) + its findings (cascade), scoped
   *  to the workspace. Returns false if not found in the workspace. */
  deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return reviewRepo.deleteReview(this.db, workspaceId, reviewId);
  }

  // ---- PR-list rollups (the pulls module reads these through a port) -----

  reviewRefsForPulls(
    prIds: string[],
  ): Promise<{ id: string; prId: string; agentId: string | null; score: number | null }[]> {
    return reviewRepo.reviewRefsForPulls(this.db, prIds);
  }

  findingSeverities(reviewIds: string[]): Promise<{ reviewId: string; severity: string }[]> {
    return reviewRepo.findingSeverities(this.db, reviewIds);
  }

  runCostsForPulls(prIds: string[]): Promise<{ prId: string; costUsd: number }[]> {
    return runRepo.runCostsForPulls(this.db, prIds);
  }

  // ---- finding actions ----------------------------------------------------

  /** The workspace a finding belongs to (through its review), if it exists. */
  findingWorkspace(findingId: string): Promise<string | undefined> {
    return reviewRepo.findingWorkspace(this.db, findingId);
  }

  setFindingAccepted(findingId: string, at: Date | null): Promise<ReviewDtoFinding | undefined> {
    return reviewRepo.setFindingAccepted(this.db, findingId, at);
  }

  setFindingDismissed(findingId: string, at: Date | null): Promise<ReviewDtoFinding | undefined> {
    return reviewRepo.setFindingDismissed(this.db, findingId, at);
  }

  // ---- intent -------------------------------------------------------------

  upsertIntent(prId: string, intent: Intent): Promise<void> {
    return pullRepo.upsertIntent(this.db, prId, intent);
  }

  getIntent(prId: string): Promise<Intent | undefined> {
    return pullRepo.getIntent(this.db, prId);
  }

  // ---- observability: agent_runs + run_traces ----------------------------

  /** Create an agent_runs row in `running` state; returns its id (= the runId). */
  createAgentRun(values: {
    workspaceId: string;
    agentId: string | null;
    prId: string;
    provider: string | null;
    model: string | null;
  }): Promise<string> {
    return runRepo.createAgentRun(this.db, values);
  }

  completeAgentRun(runId: string, values: RunCompletion): Promise<void> {
    return runRepo.completeAgentRun(this.db, runId, values);
  }

  /** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
  saveRunTrace(runId: string, trace: RunTrace): Promise<void> {
    return runRepo.saveRunTrace(this.db, runId, trace);
  }

  getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return runRepo.getRunTrace(this.db, runId);
  }
}
