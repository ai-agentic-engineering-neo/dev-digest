import { RunTrace } from '@devdigest/shared';
import type {
  ActiveRun,
  FindingActionKind,
  FindingRecord,
  ReviewRecord,
  ReviewRunResponse,
  RunEvent,
  RunSummary,
} from '@devdigest/shared';
import { InternalError, InvalidInputError, NotFoundError } from '../../../platform/errors.js';
import type { RunBus } from '../../../platform/sse.js';
import { referencedIds, withRunContext } from '../domain/review.js';
import { finalStatusEvent } from '../domain/run.js';
import type { ReviewAgent } from '../domain/types.js';
import type { AgentDirectory, Clock, Logger, ReviewStore } from './ports.js';
import type { ReviewRunExecutor } from './run-executor.js';
import { liveEvents, singleEvent } from './run-events.js';

export interface ReviewServiceDeps {
  reviews: ReviewStore;
  agents: AgentDirectory;
  runBus: RunBus;
  executor: Pick<ReviewRunExecutor, 'executeRuns'>;
  clock: Clock;
}

/**
 * Review use cases: start review runs (executed in the background by
 * ReviewRunExecutor), follow / cancel / delete them, read reviews and traces,
 * and act on findings.
 */
export class ReviewService {
  constructor(private readonly deps: ReviewServiceDeps) {}

  // ---- Runs -----------------------------------------------------------------

  /**
   * Start one run per target agent (`all` → every enabled agent). The
   * agent_runs rows are created up front so the runIds come back at once and
   * the client can subscribe to their SSE streams; the slow review runs in the
   * background and a failure of one agent does not abort the others.
   */
  async startReview(
    workspaceId: string,
    prId: string,
    request: { agentId?: string; all?: boolean },
    logger?: Logger,
  ): Promise<ReviewRunResponse> {
    const targets = await this.resolveTargets(workspaceId, request);
    const { reviews } = this.deps;
    const pull = await reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await reviews.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const jobs: { agent: ReviewAgent; runId: string }[] = [];
    for (const agent of targets) {
      const runId = await reviews.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
      });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget: reviews are persisted as each agent finishes and the
    // client refetches when the SSE stream ends.
    void this.deps.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err }, 'review: background execution crashed');
    });

    return {
      pr_id: prId,
      runs: jobs.map(({ agent, runId }) => ({ run_id: runId, agent_id: agent.id, agent_name: agent.name })),
      reviews: [],
    };
  }

  private async resolveTargets(
    workspaceId: string,
    request: { agentId?: string; all?: boolean },
  ): Promise<ReviewAgent[]> {
    if (request.all) return this.deps.agents.listEnabled(workspaceId);
    if (request.agentId) {
      const agent = await this.deps.agents.getById(workspaceId, request.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return [agent];
    }
    throw new InvalidInputError('Provide agentId or all:true', undefined, 'invalid_run_request');
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  activeRuns(workspaceId: string, prId: string): Promise<ActiveRun[]> {
    return this.deps.reviews.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  listRuns(workspaceId: string, prId: string): Promise<RunSummary[]> {
    return this.deps.reviews.listRunsForPull(workspaceId, prId);
  }

  /** Delete one run from the history (+ its trace and review, by cascade). */
  deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.deps.reviews.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run in the workspace (404 if it is not there). Signals
   * a live runner (checkpoint + abort of its in-flight LLM calls) AND marks the
   * DB row cancelled + completes the bus immediately — so cancel also works
   * for ORPHANED runs (whose process died on a restart).
   */
  async cancelRun(workspaceId: string, runId: string): Promise<void> {
    await this.requireRun(workspaceId, runId);
    const bus = this.deps.runBus;
    bus.publish(runId, 'info', 'Cancellation requested — stopping…');
    bus.cancel(runId);
    await this.deps.reviews.cancelRunIfRunning(workspaceId, runId);
    bus.complete(runId);
  }

  /**
   * The event stream of a run in the workspace (404 if it is not there). A run
   * the bus still holds (or one still 'running' in the DB whose executor has
   * not published yet) streams live, replay first; a finished run the bus no
   * longer holds (restart / TTL eviction) yields one final status event.
   */
  async runEvents(workspaceId: string, runId: string): Promise<AsyncIterable<RunEvent>> {
    const run = await this.requireRun(workspaceId, runId);
    const bus = this.deps.runBus;
    if (!bus.has(runId) && run.status !== 'running') {
      return singleEvent(finalStatusEvent(runId, run.status, run.error, this.deps.clock()));
    }
    return liveEvents(bus, runId);
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  reapStaleRuns(): Promise<number> {
    return this.deps.reviews.reapStaleRunningRuns();
  }

  private async requireRun(workspaceId: string, runId: string) {
    const run = await this.deps.reviews.getRunInWorkspace(workspaceId, runId);
    if (!run) throw new NotFoundError('Run not found');
    return run;
  }

  /**
   * The run's trace, workspace-scoped. The stored jsonb is validated against
   * the RunTrace contract; a document that fails it is logged and surfaced as
   * a generic 500 (never echoed).
   */
  async getRunTrace(workspaceId: string, runId: string, logger?: Logger): Promise<RunTrace> {
    const row = await this.deps.reviews.getRunTraceInWorkspace(workspaceId, runId);
    if (!row) throw new NotFoundError('Run trace not found');
    const parsed = RunTrace.safeParse(row.trace);
    if (!parsed.success) {
      logger?.error({ runId, issues: parsed.error.issues }, 'run trace failed schema validation');
      throw new InternalError();
    }
    return parsed.data;
  }

  // ---- Reviews + findings ---------------------------------------------------

  /** Persisted reviews of a PR (newest first) with agent names and run usage. */
  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewRecord[]> {
    const { reviews, agents } = this.deps;
    const pull = await reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const stored = await reviews.reviewsForPull(prId);
    const { agentIds, runIds } = referencedIds(stored);
    // One IN-query each for agent names and run usage (no per-review lookup).
    const names = await agents.namesByIds(workspaceId, agentIds);
    const usage = await reviews.usageForRuns(runIds);
    return stored.map((r) =>
      withRunContext(r, r.agent_id ? names.get(r.agent_id) : null, r.run_id ? usage.get(r.run_id) : undefined),
    );
  }

  /** Delete a whole review (one agent's pass) + its findings; 404 if not in the workspace. */
  async deleteReview(workspaceId: string, reviewId: string): Promise<void> {
    const ok = await this.deps.reviews.deleteReview(workspaceId, reviewId);
    if (!ok) throw new NotFoundError('Review not found');
  }

  /**
   * Accept / dismiss a finding (the dataset later lessons build on). The other
   * FindingActionKinds are not available in the starter.
   */
  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: FindingRecord }> {
    const { reviews } = this.deps;
    if ((await reviews.findingWorkspaceId(findingId)) !== workspaceId) {
      throw new NotFoundError('Finding not found');
    }
    const at = this.deps.clock();
    let finding: FindingRecord | undefined;
    switch (action) {
      case 'accept':
        finding = await reviews.setFindingAccepted(findingId, at);
        break;
      case 'dismiss':
        finding = await reviews.setFindingDismissed(findingId, at);
        break;
      default:
        throw new InvalidInputError(`Action '${action}' is not available in the starter`, undefined, 'invalid_action');
    }
    if (!finding) throw new NotFoundError('Finding not found');
    return { finding };
  }
}
