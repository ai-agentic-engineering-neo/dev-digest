import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Finding, Intent, RunSummary, RunTrace } from '@devdigest/shared';

/**
 * A2 — review data-access. The ONLY layer touching the DB for the review
 * domain. Owns `reviews`, `findings`, `pr_intent`, and persists the
 * observability rows `agent_runs` + `run_traces` (one trace doc per run).
 * Workspace scoping is enforced via the PR (which carries workspace_id).
 *
 * `agent_runs` has exactly two legitimate writers, both funneled through this
 * class: the local review flow (`createAgentRun`/`completeAgentRun`, driven by
 * an in-process run) and CI ingest (`createCiAgentRun`, called from
 * `modules/ci/ingest.ts` when pulling results back from a workflow run). No
 * other module inserts into `agent_runs` directly — `modules/ci/repository.ts`
 * in particular owns `ci_installations` only and explicitly never touches it.
 *
 * The query implementations are colocated, split by aggregate, under
 * `./repository/` (review+findings, agent runs, pull/intent). This class
 * composes them so its public API stays identical.
 */

import type { AgentRunRow, FindingRow, PullRow } from '../../db/rows.js';
export type { AgentRunRow, FindingRow, PullRow };

export type ReviewRow = typeof t.reviews.$inferSelect;
export type MultiAgentRunRow = typeof t.multiAgentRuns.$inferSelect;

import * as reviewRepo from './repository/review.repo.js';
import * as runRepo from './repository/run.repo.js';
import * as pullRepo from './repository/pull.repo.js';

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

  insertReview(values: {
    workspaceId: string;
    prId: string;
    agentId: string | null;
    runId: string | null;
    kind: 'summary' | 'review';
    verdict: string | null;
    summary: string | null;
    score: number | null;
    model: string | null;
  }): Promise<ReviewRow> {
    return reviewRepo.insertReview(this.db, values);
  }

  insertFindings(reviewId: string, findings: Finding[]): Promise<FindingRow[]> {
    return reviewRepo.insertFindings(this.db, reviewId, findings);
  }

  /** Reviews for a PR (newest first), each with its findings. */
  reviewsForPull(prId: string): Promise<{ review: ReviewRow; findings: FindingRow[] }[]> {
    return reviewRepo.reviewsForPull(this.db, prId);
  }

  getReview(reviewId: string): Promise<ReviewRow | undefined> {
    return reviewRepo.getReview(this.db, reviewId);
  }

  getReviewScoped(workspaceId: string, reviewId: string): Promise<ReviewRow | undefined> {
    return reviewRepo.getReviewScoped(this.db, workspaceId, reviewId);
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

  completeAgentRun(
    runId: string,
    values: {
      status: 'done' | 'failed' | 'cancelled';
      durationMs: number;
      tokensIn: number;
      tokensOut: number;
      costUsd: number | null;
      findingsCount: number;
      grounding: string;
      /** Review score (0-100); null on failed/cancelled runs. */
      score?: number | null;
      /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
      blockers?: number | null;
      /** Failure reason (status='failed') / cancellation note. Null clears it. */
      error?: string | null;
    },
  ): Promise<void> {
    return runRepo.completeAgentRun(this.db, runId, values);
  }

  /** Record the head SHA a review ran against (PR-list freshness derivation). */
  markReviewed(prId: string, sha: string): Promise<void> {
    return pullRepo.markReviewed(this.db, prId, sha);
  }

  /** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
  saveRunTrace(runId: string, trace: RunTrace): Promise<void> {
    return runRepo.saveRunTrace(this.db, runId, trace);
  }

  getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return runRepo.getRunTrace(this.db, runId);
  }

  // ---- CI ingest (modules/ci/ingest.ts) — the second legitimate agent_runs writer ----

  /** Idempotent CI-run writer — see the class doc comment. Returns `undefined`
   *  when the (ci_installation_id, actions_run_id) pair already exists (AC-30). */
  createCiAgentRun(values: runRepo.CreateCiAgentRunValues): Promise<AgentRunRow | undefined> {
    return runRepo.createCiAgentRun(this.db, values);
  }

  /** All `source='ci'` runs for a workspace (`GET /ci/runs`), newest first. */
  listCiRunsForWorkspace(
    workspaceId: string,
  ): Promise<{ run: AgentRunRow; agentName: string | null }[]> {
    return runRepo.listCiRunsForWorkspace(this.db, workspaceId);
  }

  // ---- observability: multi_agent_runs (T7) -------------------------------
  //
  // These queries are new for the multi-agent review feature and are kept
  // inline here (rather than delegated to `./repository/*.repo.ts`) since this
  // file — not the repository/ subfolder — is the owned surface for this work.

  /** Create the ONE persistent multi_agent_runs row that groups a fan-out. */
  async createMultiAgentRun(workspaceId: string, prId: string): Promise<MultiAgentRunRow> {
    const [row] = await this.db.insert(t.multiAgentRuns).values({ workspaceId, prId }).returning();
    return row!;
  }

  /** Create an agent_runs row already linked to a multi-agent run (fan-out target). */
  async createAgentRunForMultiRun(values: {
    workspaceId: string;
    agentId: string | null;
    prId: string;
    provider: string | null;
    model: string | null;
    multiRunId: string;
  }): Promise<string> {
    const [row] = await this.db
      .insert(t.agentRuns)
      .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        prId: values.prId,
        provider: values.provider,
        model: values.model,
        multiRunId: values.multiRunId,
        status: 'running',
        source: 'local',
      })
      .returning({ id: t.agentRuns.id });
    return row!.id;
  }

  /** A specific multi-agent run, workspace-scoped. */
  getMultiAgentRun(workspaceId: string, id: string): Promise<MultiAgentRunRow | undefined> {
    return this.db
      .select()
      .from(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, id)))
      .then((rows) => rows[0]);
  }

  /** The most recent multi-agent run for a PR (Q1 default when no id is given). */
  latestMultiAgentRunForPr(workspaceId: string, prId: string): Promise<MultiAgentRunRow | undefined> {
    return this.db
      .select()
      .from(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
      .orderBy(desc(t.multiAgentRuns.ranAt))
      .limit(1)
      .then((rows) => rows[0]);
  }

  /** The most recent multi-agent run across the whole workspace (any PR). */
  latestMultiAgentRunForWorkspace(workspaceId: string): Promise<MultiAgentRunRow | undefined> {
    return this.db
      .select()
      .from(t.multiAgentRuns)
      .where(eq(t.multiAgentRuns.workspaceId, workspaceId))
      .orderBy(desc(t.multiAgentRuns.ranAt))
      .limit(1)
      .then((rows) => rows[0]);
  }

  /** All agent_runs fanned out under one multi-agent run. */
  agentRunsForMultiRun(multiRunId: string): Promise<AgentRunRow[]> {
    return this.db.select().from(t.agentRuns).where(eq(t.agentRuns.multiRunId, multiRunId));
  }

  /** Reviews + findings for a specific set of runs (by run_id, not pr_id). */
  async reviewsAndFindingsForRuns(
    runIds: string[],
  ): Promise<{ review: ReviewRow; findings: FindingRow[] }[]> {
    if (runIds.length === 0) return [];
    const reviews = await this.db.select().from(t.reviews).where(inArray(t.reviews.runId, runIds));
    if (reviews.length === 0) return [];
    const reviewIds = reviews.map((r) => r.id);
    const findings = await this.db.select().from(t.findings).where(inArray(t.findings.reviewId, reviewIds));
    return reviews.map((review) => ({
      review,
      findings: findings.filter((f) => f.reviewId === review.id),
    }));
  }
}
