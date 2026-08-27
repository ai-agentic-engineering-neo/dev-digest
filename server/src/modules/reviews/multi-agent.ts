/**
 * specs/13-multi-agent-review.md — the multi-agent application service.
 * Same posture as `AdhocReviewService` (`modules/reviews/adhoc.ts`): declares
 * what it needs and never imports `Container`. Lives inside `modules/reviews/`
 * rather than a new module (D-P4) — it reuses `ReviewService.runReview` and
 * `ReviewRepository`, both owned by this module, so a separate module would
 * need a container getter plus structural ports for zero architectural gain.
 */
import { NotFoundError } from '../../platform/errors.js';
import { MultiAgentRun } from '@devdigest/shared';
import type { AgentColumn, AgentColumnFinding, AgentRunEstimate } from '@devdigest/shared';
import type { Logger } from './run-executor.js';
import { ReviewRepository, type FindingRow } from './repository.js';
import { computeConflicts, type ConflictColumn, type ConflictFinding } from './conflicts.js';

/**
 * The subset of an agent row this service needs — declared locally (not
 * `db/rows.ts`'s `AgentRow`) so this file imports nothing from `src/db/` at
 * all, same pattern as `AdhocReviewService`'s `AgentRecord`
 * (`modules/reviews/adhoc.ts`, `server/LEARNINGS.md` 2026-08-11 addendum).
 * `AgentsRepository.getById`'s real row satisfies this structurally.
 */
export interface AgentTarget {
  id: string;
  name: string;
  provider: string | null;
  model: string | null;
}

/** What `trigger` needs from the agents side — declared HERE, by the
 *  consumer, same `AgentLookup` pattern `reviews/service.ts:9-12` already
 *  uses (not imported from there, to keep this port's shape narrow and
 *  local rather than tied to that file's own `AgentRow`-based one). */
export interface AgentLookup {
  getById(workspaceId: string, id: string): Promise<AgentTarget | null | undefined>;
}

/** What `MultiAgentService.trigger` needs from `ReviewService.runReview` —
 *  declared locally (same module, but narrowly, matching this file's own
 *  "declares what it needs" posture) rather than depending on the whole
 *  `ReviewService` surface. */
export interface ReviewRunner {
  runReview(
    workspaceId: string,
    prId: string,
    targets: AgentTarget[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[] }>;
}

export class MultiAgentService {
  constructor(
    private repo: ReviewRepository,
    private agents: AgentLookup,
    private reviews: ReviewRunner,
  ) {}

  /**
   * Trigger a multi-agent run (AC-9 … AC-15). In-flight guard first (AC-12);
   * every agent id resolved before any row is created (AC-14); delegates the
   * actual per-agent execution to the existing `ReviewService.runReview`.
   */
  async trigger(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: Logger,
  ): Promise<MultiAgentRun> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // AC-12: surface the in-flight run rather than queueing or duplicating it.
    const inFlight = await this.repo.inFlightMultiAgentRunForPull(workspaceId, prId);
    if (inFlight) return this.assemble(inFlight, pull.number ?? null);

    // AC-14: resolve EVERY agent id before any row is created. A single
    // unresolvable or foreign id fails the whole request.
    const targets: AgentTarget[] = [];
    for (const id of agentIds) {
      const agent = await this.agents.getById(workspaceId, id);
      if (!agent) throw new NotFoundError(`Agent not found: ${id}`);
      targets.push(agent);
    }

    const multiAgentRunId = await this.repo.createMultiAgentRun({ workspaceId, prId });
    const { runs } = await this.reviews.runReview(workspaceId, prId, targets, logger);
    await this.repo.attachRunsToMultiAgentRun(
      multiAgentRunId,
      runs.map((r) => r.run_id),
    );

    // AC-13: respond before any review has completed — every column
    // 'running' with null verdict/score/summary/error, no findings/conflicts.
    // The shared docstring at observability.ts (`MultiAgentRun`) is exactly
    // this shape for both POST and GET, so no separate assembler is needed.
    const columns: AgentColumn[] = runs.map((r) => {
      const target = targets.find((t) => t.id === r.agent_id);
      return {
        run_id: r.run_id,
        agent_id: r.agent_id,
        agent_name: r.agent_name,
        provider: target?.provider ?? null,
        model: target?.model ?? null,
        status: 'running',
        verdict: null,
        score: null,
        summary: null,
        duration_ms: null,
        cost_usd: null,
        error: null,
        findings: [],
      };
    });

    return {
      id: multiAgentRunId,
      pr_id: prId,
      pr_number: pull.number ?? null,
      ran_at: new Date().toISOString(),
      agent_count: columns.length,
      total_duration_ms: 0,
      total_cost_usd: null,
      columns,
      conflicts: [],
    };
  }

  /** GET /pulls/:id/multi-agent — the latest grouping's assembled response,
   *  or null when this PR has no multi-agent run yet (AC-51). */
  async latest(workspaceId: string, prId: string): Promise<MultiAgentRun | null> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const run = await this.repo.latestMultiAgentRunForPull(workspaceId, prId);
    if (!run) return null;
    return this.assemble(run, pull.number ?? null);
  }

  /** GET /multi-agent/estimates — zero LLM calls anywhere on this path (AC-8). */
  async estimates(workspaceId: string): Promise<AgentRunEstimate[]> {
    const rows = await this.repo.agentRunEstimates(workspaceId);
    return rows.map((r) => ({
      agent_id: r.agent_id,
      agent_name: r.agent_name,
      runs: r.runs,
      avg_duration_ms: r.avg_duration_ms,
      avg_cost_usd: r.avg_cost_usd,
    }));
  }

  /**
   * Assemble the response for an already-persisted grouping: one
   * `AgentColumn` per grouped run (IN-query + JS grouping — no per-row
   * queries, no diff re-fetch, no checkout, no provider call, AC-31), plus
   * conflicts computed on read (AC-30, AC-35). Parsed through the shared
   * `MultiAgentRun` schema before returning, so a shape violation is rejected
   * at the boundary rather than partially rendered (AC-54).
   */
  private async assemble(
    maRun: { id: string; prId: string; ranAt: Date },
    prNumber: number | null,
  ): Promise<MultiAgentRun> {
    const [grouped, reviews] = await Promise.all([
      this.repo.groupedRuns(maRun.id),
      this.repo.reviewsForPull(maRun.prId),
    ]);
    const reviewByRunId = new Map(
      reviews.filter((r) => r.review.runId != null).map((r) => [r.review.runId as string, r]),
    );

    const columns: AgentColumn[] = [];
    const conflictColumns: ConflictColumn[] = [];

    for (const { run, agentName } of grouped) {
      const reviewEntry = reviewByRunId.get(run.id);
      const findings: FindingRow[] = reviewEntry?.findings ?? [];
      const status = (run.status ?? 'running') as AgentColumn['status'];

      let name = agentName;
      if (!name) {
        // Agent deleted after the run (agent_runs.agent_id is set null) —
        // fall back to the trace's recorded name; never crash (the spec's
        // edge case).
        const trace = await this.repo.getRunTrace(run.id);
        name = trace?.config.agent ?? 'Deleted agent';
      }
      // agent_id is a required (non-nullable) field of AgentColumn; a
      // deleted agent leaves agent_runs.agent_id null, so fall back to the
      // run's own (always-present) id as a stable per-column identity.
      const agentId = run.agentId ?? run.id;

      const compactFindings: AgentColumnFinding[] = findings.map((f) => ({
        id: f.id,
        severity: f.severity as AgentColumnFinding['severity'],
        category: f.category,
        title: f.title,
        file: f.file,
        start_line: f.startLine,
        kind: f.kind,
      }));

      columns.push({
        run_id: run.id,
        agent_id: agentId,
        agent_name: name,
        provider: run.provider,
        model: run.model,
        status,
        verdict: reviewEntry?.review.verdict ?? null,
        score: run.score,
        summary: reviewEntry?.review.summary ?? null,
        duration_ms: run.durationMs,
        cost_usd: run.costUsd,
        error: run.error,
        findings: compactFindings,
      });

      const conflictFindings: ConflictFinding[] = findings.map((f) => ({
        id: f.id,
        severity: f.severity as ConflictFinding['severity'],
        title: f.title,
        file: f.file,
        start_line: f.startLine,
        end_line: f.endLine,
        kind: f.kind,
        rationale: f.rationale,
      }));
      conflictColumns.push({ agent_id: agentId, agent_name: name, status, findings: conflictFindings });
    }

    // AC-24: wall-clock duration is the MAX of the grouped runs (concurrent
    // execution, D16) that have finished; cost is the SUM, but unavailable —
    // never $0 — if any grouped run's cost is unknown.
    const knownDurations = columns.map((c) => c.duration_ms).filter((d): d is number => d != null);
    const total_duration_ms = knownDurations.length > 0 ? Math.max(...knownDurations) : 0;
    const costs = columns.map((c) => c.cost_usd);
    const total_cost_usd = costs.every((c) => c != null)
      ? costs.reduce<number>((sum, c) => sum + (c as number), 0)
      : null;

    const result: MultiAgentRun = {
      id: maRun.id,
      pr_id: maRun.prId,
      pr_number: prNumber,
      ran_at: maRun.ranAt.toISOString(),
      agent_count: columns.length,
      total_duration_ms,
      total_cost_usd,
      columns,
      conflicts: computeConflicts(conflictColumns),
    };

    // AC-54 — reject a shape violation at the boundary rather than partially
    // render it. `MultiAgentRun` is both the zod schema and its inferred
    // type (the same merged const+type declaration every contract in
    // `vendor/shared/contracts` uses), so `.parse` is available on the value
    // imported above.
    return MultiAgentRun.parse(result);
  }
}
