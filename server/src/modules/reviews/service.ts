import type { RunBus } from '../../platform/sse.js';

/**
 * What review orchestration needs from the agents side — declared HERE, by the
 * consumer, not imported from the agents module. AgentsRepository satisfies it
 * structurally, so the container can still pass the real one while this module
 * stays independent of agents' internals.
 */
export interface AgentLookup {
  listEnabled(workspaceId: string): Promise<AgentRow[]>;
  getById(workspaceId: string, id: string): Promise<AgentRow | null | undefined>;
}
import type { FindingActionKind, IntentDetail, RunEventKind, RunTrace, SmartDiff, UnifiedDiff } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRow, RepoRow } from '../../db/rows.js';
import { ReviewRepository, type PullRow } from './repository.js';
import { type ReviewDto, type ReviewDtoFinding } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import { reviewToDto } from './helpers.js';
import { buildSmartDiff } from './smart-diff.js';

/**
 * Narrow ports for L03's standalone recalculate-intent flow — declared HERE,
 * by the consumer, same "no container in application services" / "modules
 * compose in the container, not by importing each other" rules `AgentLookup`
 * above already follows. `IntentResolveInput`/`IntentResolveResult` are a
 * structural mirror of `modules/intent/service.ts`'s `ResolveIntentInput`/
 * `IntentResolution` — NOT imported from there (dependency-cruiser's
 * `no-cross-module` forbids `modules/reviews` importing `modules/intent`
 * directly); `container.intentService.resolve` satisfies this shape
 * structurally, bound in routes.ts (the one ring allowed to know concrete
 * classes and compose across modules).
 */
export type DiffLoader = (workspaceId: string, pull: PullRow, repo: RepoRow) => Promise<UnifiedDiff>;
export interface IntentResolveInput {
  workspaceId: string;
  pull: { id: string; title: string; body: string | null };
  repo: { owner: string; name: string; clonePath: string | null };
  diffFiles: {
    path: string;
    hunks: { oldStart: number; oldLines: number; newStart: number; newLines: number }[];
  }[];
  onSignal?: (msg: string) => void;
}
export interface IntentResolveResult {
  rendered?: string;
  inScope?: string[];
  outOfScope?: string[];
  contextGaps?: string[];
  signals: string[];
}
export type IntentResolver = (input: IntentResolveInput) => Promise<IntentResolveResult>;

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over container.runBus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  constructor(
    private repo: ReviewRepository,
    private agents: AgentLookup,
    private executor: ReviewRunExecutor,
    private runBus: RunBus,
    private loadDiffPort: DiffLoader,
    private resolveIntentPort: IntentResolver,
  ) {}

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean },
  ): Promise<AgentRow[]> {
    if (opts.all) return this.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.runBus.cancel(runId);
    await this.repo.cancelRunIfRunning(runId);
    this.runBus.complete(runId);
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRow[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[] }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentRow; runId: string }[] = [];
    for (const agent of targets) {
      const runId = await this.repo.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
      });
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [] };
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.runBus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding; memoryId?: string }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const { review } of rows) {
      if (review.agentId && !names.has(review.agentId)) {
        const a = await this.agents.getById(workspaceId, review.agentId);
        if (a) names.set(review.agentId, a.name);
      }
    }
    return rows.map(({ review, findings }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null),
    );
  }

  async getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return this.repo.getRunTrace(runId);
  }

  /**
   * Deterministic file-risk classification + latest-review findings merge —
   * no LLM call. See `smart-diff.ts` for the pure classifier/assembler.
   */
  async smartDiff(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const files = await this.repo.getPrFiles(prId);
    const reviews = await this.repo.reviewsForPull(prId);
    const findings = reviews[0]?.findings ?? []; // newest first
    return buildSmartDiff(files, findings);
  }

  /**
   * Manual, on-demand intent recomputation — outside the normal
   * compute-on-review-run flow (`ReviewRunExecutor.executeRuns`), for a user
   * who wants a fresh read (e.g. after editing the PR description) without
   * running a full agent review. Reuses the same diff-load + `IntentService.resolve`
   * sequence `executeRuns` runs once per batch; `resolve()` persists the
   * result itself (best-effort), so this method only re-shapes it into the
   * same five fields `GET /pulls/:id` already serves.
   */
  async recalculateIntent(workspaceId: string, prId: string, logger?: Logger): Promise<IntentDetail> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const diff = await this.loadDiffPort(workspaceId, pull, repo);
    const intent = await this.resolveIntentPort({
      workspaceId,
      pull: { id: pull.id, title: pull.title, body: pull.body },
      repo: { owner: repo.owner, name: repo.name, clonePath: repo.clonePath },
      diffFiles: diff.files.map((f) => ({
        path: f.path,
        hunks: f.hunks.map((h) => ({
          oldStart: h.oldStart,
          oldLines: h.oldLines,
          newStart: h.newStart,
          newLines: h.newLines,
        })),
      })),
      onSignal: (msg) => logger?.info(msg),
    });

    return {
      intent: intent.rendered ?? null,
      intent_in_scope: intent.inScope ?? null,
      intent_out_of_scope: intent.outOfScope ?? null,
      intent_context_gaps: intent.contextGaps ?? null,
      intent_signals: intent.signals.length > 0 ? intent.signals : null,
    };
  }
}
