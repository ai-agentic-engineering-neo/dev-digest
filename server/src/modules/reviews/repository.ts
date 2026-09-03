import type { Db, DbOrTx } from '../../db/client.js';
import type * as t from '../../db/schema.js';
import type { AgentRunSummary, Finding, Intent, RunSummary, RunTrace } from '@devdigest/shared';

/**
 * A2 — review data-access. The ONLY layer touching the DB for the review
 * domain. Owns `reviews`, `findings`, `pr_intent`, and persists the
 * observability rows `agent_runs` + `run_traces` (one trace doc per run).
 * Workspace scoping is enforced via the PR (which carries workspace_id).
 *
 * The query implementations are colocated, split by aggregate, under
 * `./repository/` (review+findings, agent runs, pull/intent). This class
 * composes them so its public API stays identical.
 */

import type { FindingRow, PullRow } from '../../db/rows.js';
export type { FindingRow, PullRow };

export type ReviewRow = typeof t.reviews.$inferSelect;

import * as reviewRepo from './repository/review.repo.js';
import * as runRepo from './repository/run.repo.js';
import * as pullRepo from './repository/pull.repo.js';
import type { IntentMeta, IntentRecord } from './repository/pull.repo.js';
import * as statsRepo from './repository/stats.repo.js';
import type { AgentFindingRow } from './repository/stats.repo.js';

export type { IntentMeta, IntentRecord };

export class ReviewRepository {
  constructor(private db: Db) {}

  // ---- PR lookup (workspace-scoped) --------------------------------------

  getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    return pullRepo.getPull(this.db, workspaceId, prId);
  }

  getRepo(repoId: string): Promise<typeof t.repos.$inferSelect | undefined> {
    return pullRepo.getRepo(this.db, repoId);
  }

  getPrFiles(prId: string): Promise<(typeof t.prFiles.$inferSelect)[]> {
    return pullRepo.getPrFiles(this.db, prId);
  }

  // ---- reviews + findings -------------------------------------------------

  /**
   * `tx` lets a caller (e.g. `run-executor.ts`'s `insertReview` →
   * `insertFindings` → `markReviewed` unit of work) run this inside its own
   * transaction; omitted, it uses the shared pooled `Db` as before.
   */
  insertReview(
    values: {
      workspaceId: string;
      prId: string;
      agentId: string | null;
      runId: string | null;
      kind: 'summary' | 'review';
      verdict: string | null;
      summary: string | null;
      score: number | null;
      model: string | null;
    },
    tx?: DbOrTx,
  ): Promise<ReviewRow> {
    return reviewRepo.insertReview(tx ?? this.db, values);
  }

  insertFindings(reviewId: string, findings: Finding[], tx?: DbOrTx): Promise<FindingRow[]> {
    return reviewRepo.insertFindings(tx ?? this.db, reviewId, findings);
  }

  /** Reviews for a PR (newest first), each with its findings. */
  reviewsForPull(prId: string): Promise<{ review: ReviewRow; findings: FindingRow[] }[]> {
    return reviewRepo.reviewsForPull(this.db, prId);
  }

  getReview(reviewId: string): Promise<ReviewRow | undefined> {
    return reviewRepo.getReview(this.db, reviewId);
  }

  // ---- PR-list rollups (consumed by the pulls module via container.reviewRepo)

  /** Review rows for a batch of PRs, newest-first — the list's score + findings. */
  reviewSummariesForPulls(
    prIds: string[],
  ): Promise<{ id: string; prId: string; agentId: string | null; score: number | null }[]> {
    return reviewRepo.reviewSummariesForPulls(this.db, prIds);
  }

  /** Finding severities under a set of reviews — the list's severity chips. */
  findingSeveritiesForReviews(
    reviewIds: string[],
  ): Promise<{ reviewId: string; severity: string }[]> {
    return reviewRepo.findingSeveritiesForReviews(this.db, reviewIds);
  }

  /** Completed runs for a batch of PRs, newest-first — the list's cost badge. */
  doneRunCostsForPulls(prIds: string[]): Promise<{ prId: string | null; costUsd: number | null }[]> {
    return runRepo.doneRunCostsForPulls(this.db, prIds);
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

  /** All runs for an AGENT (any status), newest first, capped — the Stats
   *  tab's run-history table, across every PR the agent has reviewed. */
  listRunsForAgent(
    workspaceId: string,
    agentId: string,
    opts?: { sinceDate?: Date; limit?: number },
  ): Promise<AgentRunSummary[]> {
    return runRepo.listRunsForAgent(this.db, workspaceId, agentId, opts);
  }

  /** findings→reviews→agent_runs for one agent since a date — the Stats
   *  tab's accept-rate/severity/category aggregates are all computed from
   *  this in application code. */
  findingsForAgentWindow(
    workspaceId: string,
    agentId: string,
    sinceDate: Date,
  ): Promise<AgentFindingRow[]> {
    return statsRepo.findingsForAgentWindow(this.db, workspaceId, agentId, sinceDate);
  }

  /** run_traces for one agent's runs since a date — read for `skills_used`
   *  tallying (Stats tab's "most-used skills"). */
  runTracesForAgentWindow(workspaceId: string, agentId: string, sinceDate: Date): Promise<RunTrace[]> {
    return statsRepo.runTracesForAgentWindow(this.db, workspaceId, agentId, sinceDate);
  }

  /** Same join as `findingsForAgentWindow`, workspace-wide — the Skill Stats
   *  tab filters this by "was this skill active in this run" itself. */
  findingsForWorkspaceWindow(workspaceId: string, sinceDate: Date): Promise<AgentFindingRow[]> {
    return statsRepo.findingsForWorkspaceWindow(this.db, workspaceId, sinceDate);
  }

  /** run_traces workspace-wide, with each trace's run id — lets the Skill
   *  Stats tab know WHICH runs had a given skill active. */
  runTracesForWorkspaceWindow(
    workspaceId: string,
    sinceDate: Date,
  ): Promise<{ runId: string; trace: RunTrace }[]> {
    return statsRepo.runTracesForWorkspaceWindow(this.db, workspaceId, sinceDate);
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

  // ---- finding actions ----------------------------------------------------

  getFinding(findingId: string): Promise<FindingRow | undefined> {
    return reviewRepo.getFinding(this.db, findingId);
  }

  /** Resolve workspace_id + pr_id for a finding (via review → pr). */
  findingContext(
    findingId: string,
  ): Promise<{ finding: FindingRow; review: ReviewRow; pull: PullRow } | undefined> {
    return reviewRepo.findingContext(this.db, findingId);
  }

  setFindingAccepted(findingId: string, at: Date | null): Promise<FindingRow | undefined> {
    return reviewRepo.setFindingAccepted(this.db, findingId, at);
  }

  setFindingDismissed(findingId: string, at: Date | null): Promise<FindingRow | undefined> {
    return reviewRepo.setFindingDismissed(this.db, findingId, at);
  }

  // ---- intent -------------------------------------------------------------

  upsertIntent(prId: string, intent: Intent, meta: IntentMeta): Promise<void> {
    return pullRepo.upsertIntent(this.db, prId, intent, meta);
  }

  getIntent(prId: string): Promise<IntentRecord | undefined> {
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

  completeAgentRun(
    runId: string,
    values: {
      status: 'done' | 'failed' | 'cancelled';
      durationMs: number;
      tokensIn: number;
      tokensOut: number;
      /**
       * USD billed for this run. Omit (or pass null) on failed/cancelled runs and
       * whenever the model is unpriced — 0 would claim the review was free.
       */
      costUsd?: number | null;
      findingsCount: number;
      grounding: string;
      /** Review score (0-100); null on failed/cancelled runs. */
      score?: number | null;
      /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
      blockers?: number | null;
      /** Per-severity finding tally; null on failed/cancelled runs. */
      criticalCount?: number | null;
      warningCount?: number | null;
      suggestionCount?: number | null;
      /** Failure reason (status='failed') / cancellation note. Null clears it. */
      error?: string | null;
    },
  ): Promise<void> {
    return runRepo.completeAgentRun(this.db, runId, values);
  }

  /** Record the head SHA a review ran against (PR-list freshness derivation). */
  markReviewed(prId: string, sha: string, tx?: DbOrTx): Promise<void> {
    return pullRepo.markReviewed(tx ?? this.db, prId, sha);
  }

  /** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
  saveRunTrace(runId: string, trace: RunTrace): Promise<void> {
    return runRepo.saveRunTrace(this.db, runId, trace);
  }

  getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return runRepo.getRunTrace(this.db, runId);
  }
}
