import type { Agent, FindingActionKind, FindingRecord, ReviewRecord, RunEventKind, RunTrace } from '@devdigest/shared';
import { BadRequestError, NotFoundError } from '../../platform/errors.js';
import { replayEvents, type RunEventSource } from './domain.js';
import { ReviewRunExecutor, type RunExecutorDeps } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import type { AgentLookup, Logger, RepoLookup } from './ports.js';

export type { RunEventSource } from './domain.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over the run bus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */

export interface ReviewServiceDeps extends RunExecutorDeps {
  agents: AgentLookup;
  repos: RepoLookup;
}

export class ReviewService {
  private executor: ReviewRunExecutor;
  private startQueue: Promise<void> = Promise.resolve();

  constructor(private deps: ReviewServiceDeps) {
    this.executor = new ReviewRunExecutor(deps);
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → all enabled agents; else a single agent.
   */
  async resolveTargets(
    workspaceId: string,
    opts: { agentId?: string; all?: boolean },
  ): Promise<Agent[]> {
    if (opts.all) return this.deps.agents.listEnabled(workspaceId);
    if (opts.agentId) {
      const agent = await this.deps.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new BadRequestError('invalid_run_request', 'Provide agentId or all:true');
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.deps.store.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.deps.store.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.deps.store.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.deps.store.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Where the events of a run come from. A running run, or one the bus still
   * holds, streams live (replay of the buffer, then live, ending on completion).
   * A finished run the bus has forgotten replays its stored trace log; one with
   * no trace replays nothing. An unknown run is a 404.
   */
  async runEventSource(workspaceId: string, runId: string): Promise<RunEventSource> {
    const run = await this.deps.store.getRunStatus(workspaceId, runId);
    if (!run) throw new NotFoundError('Run not found');
    if (run.status === 'running' || this.deps.events.has(runId)) return { kind: 'live' };
    const trace = await this.deps.store.getRunTrace(runId);
    return { kind: 'replay', events: replayEvents(runId, trace?.log ?? []) };
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   *
   * The cancellation flag outlives `complete()`: a live runner still reads it
   * after the LLM returns, and clears it itself when it exits. A run that had
   * already finished has no runner left to clear it, so it is cleared here.
   */
  async cancelRun(runId: string): Promise<void> {
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.deps.events.cancel(runId);
    const wasRunning = await this.deps.store.cancelRunIfRunning(runId);
    if (!wasRunning) this.deps.events.clearCancelled(runId);
    this.deps.events.complete(runId);
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
    targets: Agent[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewRecord[] }> {
    const pull = await this.deps.pulls.getById(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.deps.repos.getById(workspaceId, pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    // A run already `running` for the same (PR, agent) is returned as is, not
    // duplicated (XC-5). The check and the insert are serialized so two
    // simultaneous requests cannot both pass the check.
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: Agent; runId: string }[] = [];
    await this.serialized(async () => {
      const active = await this.deps.store.activeRunsForPull(workspaceId, prId);
      for (const agent of targets) {
        const existing = active.find((r) => r.agent_id === agent.id);
        if (existing) {
          runs.push({ run_id: existing.run_id, agent_id: agent.id, agent_name: agent.name });
          continue;
        }
        const runId = await this.deps.store.createAgentRun({
          workspaceId,
          agentId: agent.id,
          prId,
          provider: agent.provider,
          model: agent.model,
        });
        runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
        jobs.push({ agent, runId });
      }
    });

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    if (jobs.length > 0) {
      void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
        logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
      });
    }

    return { runs, reviews: [] };
  }

  /** Run `fn` after every earlier serialized call has settled. */
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.startQueue.then(fn);
    this.startQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.deps.events.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: FindingRecord }> {
    return actOnFindingImpl(this.deps.store, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewRecord[]> {
    const pull = await this.deps.pulls.getById(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const reviews = await this.deps.store.reviewsForPull(prId);
    const names = new Map<string, string>();
    for (const review of reviews) {
      if (review.agent_id && !names.has(review.agent_id)) {
        const a = await this.deps.agents.getById(workspaceId, review.agent_id);
        if (a) names.set(review.agent_id, a.name);
      }
    }
    return reviews.map((review) => ({
      ...review,
      agent_name: (review.agent_id ? names.get(review.agent_id) : null) ?? null,
    }));
  }

  async getRunTrace(runId: string): Promise<RunTrace | undefined> {
    return this.deps.store.getRunTrace(runId);
  }
}
