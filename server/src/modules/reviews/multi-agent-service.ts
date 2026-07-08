import type { Container } from '../../platform/container.js';
import type {
  AgentColumn,
  AgentColumnFinding,
  MultiAgentRun,
  MultiAgentRunLatest,
  MultiAgentRunTriggerResult,
  Severity,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { ReviewRepository, type FindingRow } from './repository.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { computeConflicts, type ConflictFinding, type RosterAgent } from './multi-agent-conflicts.js';

/**
 * T7 — multi-agent review service (onion rule: this class never touches the
 * DB directly — every query lives in `ReviewRepository`). Orchestrates:
 *   trigger(): create ONE `multi_agent_runs` row + N `agent_runs` (fan-out
 *              targets), then fire `ReviewRunExecutor.executeRuns` the same
 *              fire-and-forget way `ReviewService.runReview` does.
 *   read():    assemble the columns (one per agent) + conflicts + totals for
 *              a persisted multi-agent run (latest for the PR, or a specific
 *              one when `multiRunId` is given — Q1).
 */
export class MultiAgentReviewService {
  private repo: ReviewRepository;
  private agents: Container['agentsRepo'];
  private executor: ReviewRunExecutor;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
    this.agents = container.agentsRepo;
    this.executor = new ReviewRunExecutor(container, this.repo, this.agents);
  }

  /** Trigger a multi-agent review: fan N agents out over one PR. */
  async trigger(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: Logger,
  ): Promise<MultiAgentRunTriggerResult> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const targetAgents = await this.agents.listByIds(workspaceId, agentIds);
    if (targetAgents.length === 0) {
      throw new AppError('invalid_run_request', 'No matching agents found', 400);
    }

    const multiRun = await this.repo.createMultiAgentRun(workspaceId, prId);

    const targets: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: (typeof targetAgents)[number]; runId: string }[] = [];
    for (const agent of targetAgents) {
      const runId = await this.repo.createAgentRunForMultiRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
        multiRunId: multiRun.id,
      });
      targets.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget, same as ReviewService.runReview: the route returns
    // immediately with the ids, and the client subscribes to each run's SSE
    // stream (existing GET /runs/:id/events) for live progress.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error(
        { multiRunId: multiRun.id, err: (err as Error).message },
        'multi-agent review: executeRuns failed',
      );
    });

    return { id: multiRun.id, pr_id: prId, targets };
  }

  /**
   * The single most recent multi-agent run across the workspace (any PR), or
   * null when none exist. Powers the GLOBAL nav landing back on the last run
   * instead of always re-opening the "configure run" form.
   */
  async latest(workspaceId: string): Promise<MultiAgentRunLatest> {
    const multiRun = await this.repo.latestMultiAgentRunForWorkspace(workspaceId);
    if (!multiRun) return null;
    const pull = await this.repo.getPull(workspaceId, multiRun.prId);
    return { id: multiRun.id, pr_id: multiRun.prId, pr_number: pull?.number ?? null };
  }

  /**
   * The most recent multi-agent run for a specific PR, or null when none exist.
   * Returns 200-null (never 404) so the PR-detail page can gate a "view
   * multi-agent run" link without emitting console errors.
   */
  async latestForPr(workspaceId: string, prId: string): Promise<MultiAgentRunLatest> {
    const multiRun = await this.repo.latestMultiAgentRunForPr(workspaceId, prId);
    if (!multiRun) return null;
    const pull = await this.repo.getPull(workspaceId, prId);
    return { id: multiRun.id, pr_id: prId, pr_number: pull?.number ?? null };
  }

  /**
   * Read a persisted multi-agent run: its per-agent columns, the deterministic
   * conflicts across them, and aggregate totals. Defaults to the most recent
   * multi-agent run for the PR when `multiRunId` is not given (Q1).
   */
  async read(workspaceId: string, prId: string, multiRunId?: string): Promise<MultiAgentRun> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const multiRun = multiRunId
      ? await this.repo.getMultiAgentRun(workspaceId, multiRunId)
      : await this.repo.latestMultiAgentRunForPr(workspaceId, prId);
    if (!multiRun || multiRun.prId !== prId) {
      throw new NotFoundError('Multi-agent run not found');
    }

    const runs = await this.repo.agentRunsForMultiRun(multiRun.id);
    const runIds = runs.map((r) => r.id);
    const reviewsAndFindings = await this.repo.reviewsAndFindingsForRuns(runIds);
    const reviewByRunId = new Map(
      reviewsAndFindings
        .filter((rf) => rf.review.runId !== null)
        .map((rf) => [rf.review.runId as string, rf]),
    );

    // Agent names for the roster — resolved in bulk (no N+1), falling back to
    // "Unknown agent" for a since-deleted agent (agent_id is set-null on delete).
    const agentIds = [...new Set(runs.map((r) => r.agentId).filter((id): id is string => !!id))];
    const agentRows = await this.agents.listByIds(workspaceId, agentIds);
    const agentNameById = new Map(agentRows.map((a) => [a.id, a.name]));

    const columns: AgentColumn[] = runs.map((run) => {
      const rf = reviewByRunId.get(run.id);
      const findings: AgentColumnFinding[] = (rf?.findings ?? []).map((f: FindingRow) => ({
        id: f.id,
        severity: f.severity as Severity,
        category: f.category,
        title: f.title,
        file: f.file,
        start_line: f.startLine,
        kind: f.kind ?? null,
      }));
      return {
        run_id: run.id,
        agent_id: run.agentId ?? '',
        agent_name: (run.agentId && agentNameById.get(run.agentId)) || 'Unknown agent',
        provider: run.provider,
        model: run.model,
        status: (run.status as 'done' | 'failed' | 'running' | 'cancelled' | null) ?? 'running',
        verdict: rf?.review.verdict ?? null,
        score: run.score ?? null,
        summary: rf?.review.summary ?? null,
        duration_ms: run.durationMs ?? null,
        cost_usd: run.costUsd ?? null,
        findings,
      };
    });

    // Conflict matching needs end_line (not on the AgentColumn contract), so
    // it's built straight from the raw findings, not from `columns` above.
    const roster: RosterAgent[] = columns.map((c) => ({ agent_id: c.agent_id, agent_name: c.agent_name }));
    const conflictFindings: ConflictFinding[] = [];
    for (const run of runs) {
      if (!run.agentId) continue;
      const rf = reviewByRunId.get(run.id);
      if (!rf) continue;
      for (const f of rf.findings) {
        conflictFindings.push({
          agent_id: run.agentId,
          file: f.file,
          start_line: f.startLine,
          end_line: f.endLine,
          severity: f.severity as Severity,
          title: f.title,
        });
      }
    }
    const conflicts = computeConflicts(roster, conflictFindings);

    const durations = columns.map((c) => c.duration_ms).filter((d): d is number => d !== null);
    const total_duration_ms = durations.length > 0 ? Math.max(...durations) : 0;
    const costs = columns.map((c) => c.cost_usd).filter((c): c is number => c !== null);
    const total_cost_usd = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null;

    return {
      id: multiRun.id,
      pr_id: prId,
      pr_number: pull.number,
      ran_at: multiRun.ranAt.toISOString(),
      agent_count: columns.length,
      total_duration_ms,
      total_cost_usd,
      columns,
      conflicts,
    };
  }
}
