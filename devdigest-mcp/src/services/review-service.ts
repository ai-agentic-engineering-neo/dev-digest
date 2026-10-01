// Ring 2. All review orchestration: reading findings and running an agent.
// Depends on the DevDigestApi port only. Never cancels a run on the server.
import {
  agentNotFoundMessage,
  runCancelledMessage,
  runDoneWithoutReviewMessage,
  runFailedMessage,
  runInProgressMessage,
  runLeftRunningMessage,
  runNotFoundMessage,
  runStartTimeoutMessage,
  ToolError,
} from '../domain/errors.js';
import { ApiError, type DevDigestApi } from '../domain/ports.js';
import { toFindingsSummary, truncate, type FindingsSummary } from '../domain/trim.js';
import { log } from '../log.js';
import type { Resolver } from './resolver.js';

export interface RunOptions {
  /** Called with a short human-readable line per run event (progress notifications). */
  onProgress?: (message: string) => void;
  /** Fires when the MCP client aborts the call. */
  signal?: AbortSignal;
}

export class ReviewService {
  constructor(
    private readonly api: DevDigestApi,
    private readonly resolver: Resolver,
    private readonly runTimeoutMs: number,
  ) {}

  async getFindings(args: { repo: string; pr: number; runId: string; limit: number }): Promise<FindingsSummary> {
    const { pull } = await this.resolver.resolvePull(args.repo, args.pr);
    const review = await this.findReview(pull.id, args.runId);
    if (review) return toFindingsSummary(review, args.limit);

    const run = (await this.api.listRuns(pull.id)).find((r) => r.run_id === args.runId);
    if (!run) throw new ToolError(runNotFoundMessage(args.runId, args.repo, args.pr));
    switch (run.status) {
      case 'failed':
        throw new ToolError(runFailedMessage(args.runId, run.error));
      case 'cancelled':
        throw new ToolError(runCancelledMessage(args.runId));
      case 'done':
        throw new ToolError(runDoneWithoutReviewMessage(args.runId, args.repo, args.pr));
      default: // running | null | unknown
        throw new ToolError(runInProgressMessage(args.runId));
    }
  }

  async runAgentOnPr(args: { repo: string; pr: number; agent: string }, opts: RunOptions = {}): Promise<FindingsSummary> {
    // Deadline starts at tool entry: pull resolution may sync with GitHub.
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), this.runTimeoutMs);
    const signal = opts.signal ? AbortSignal.any([deadline.signal, opts.signal]) : deadline.signal;
    try {
      const { pull } = await this.resolver.resolvePull(args.repo, args.pr);

      // Pre-check: the server starts runs for disabled agents and 500s on unknown ids.
      const agent = (await this.api.listAgents()).find((a) => a.id === args.agent && a.enabled);
      if (!agent) throw new ToolError(agentNotFoundMessage(args.agent));

      if (signal.aborted) throw new ToolError(runStartTimeoutMessage(args.repo, args.pr));

      const started = await this.api.startReview(pull.id, agent.id);
      const target = started.runs[0];
      if (!target) throw new ApiError({ kind: 'contract', endpoint: '/pulls/:id/review' });
      const runId = target.run_id;
      // From here on the run exists server-side: every outcome names run_id.
      log.info(`started run ${runId} (PR #${args.pr} in ${args.repo})`);
      opts.onProgress?.(`Run ${runId} started`);

      const leftRunning = (kind: 'timeout' | 'dropped' | 'client_abort'): ToolError =>
        new ToolError(
          runLeftRunningMessage(
            runId,
            args.repo,
            args.pr,
            kind === 'timeout' ? { kind, ms: this.runTimeoutMs } : { kind },
          ),
        );
      const abortKind = (): 'timeout' | 'client_abort' => (deadline.signal.aborted ? 'timeout' : 'client_abort');

      let outcome: 'closed' | 'aborted';
      try {
        outcome = (
          await this.api.waitForRunEnd(runId, signal, (e) =>
            opts.onProgress?.(truncate(`${e.kind}: ${e.message}`.replace(/\s+/g, ' '), 200)),
          )
        ).outcome;
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        log.warn(`run ${runId}: event stream failed (${err.kind})`);
        throw leftRunning('dropped');
      }
      if (outcome === 'aborted') throw leftRunning(abortKind());

      // Stream closed: the run row decides what happened.
      let run;
      try {
        run = (await this.api.listRuns(pull.id)).find((r) => r.run_id === runId);
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        throw leftRunning('dropped');
      }
      switch (run?.status) {
        case 'done': {
          let review;
          try {
            review = await this.findReview(pull.id, runId);
          } catch (err) {
            if (!(err instanceof ApiError)) throw err;
            throw leftRunning('dropped');
          }
          if (!review) throw new ToolError(runDoneWithoutReviewMessage(runId, args.repo, args.pr));
          return toFindingsSummary(review, 20);
        }
        case 'failed':
          throw new ToolError(runFailedMessage(runId, run.error));
        case 'cancelled':
          throw new ToolError(runCancelledMessage(runId));
        default: // running | null | missing: stream dropped (e.g. API restart)
          throw leftRunning('dropped');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async findReview(prId: string, runId: string) {
    const reviews = await this.api.listReviews(prId);
    return reviews.find((r) => r.kind === 'review' && r.run_id === runId);
  }
}
