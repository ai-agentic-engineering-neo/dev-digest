import type {
  EvalAgentDetail,
  EvalAgentSummary,
  EvalCallout,
  EvalCase,
  EvalCaseMeta,
  EvalCompare,
  EvalDashboard,
  EvalExpectation,
  EvalOwnerKind,
  EvalRun,
  EvalRunAllResult,
  EvalRunEstimate,
  EvalRunRecord,
  EvalTrendPoint,
  LLMProvider,
} from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { EvalRepository, type EvalCaseRow, type EvalRunRow } from './repository.js';
import { isExpectationGrounded, synthesizeFrozenDiff } from './frozen-input.js';
import { errorCaseOutcome, scoreCase, scoreRun } from './scoring.js';
import { EvalExecutor } from './executor.js';
import { diffLines } from './prompt-diff.js';
import { buildCallout } from './callout.js';
import { MAX_FROZEN_DIFF_BYTES, STALE_RUN_TIMEOUT_MS } from './constants.js';
import type { AgentLookup, AgentRecord, LlmResolver, SkillLookup } from './ports.js';

/** Pino-compatible subset — no Fastify `app.log` reaches the container
 *  (composition-root boundary); `console` satisfies this, same as
 *  `onboardingService`/`briefService` (`platform/container.ts`). */
export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface CaseEditInput {
  name?: string;
  notes?: string | null;
  input_diff?: string;
  input_files?: string[];
  input_meta?: EvalCaseMeta;
  expectation?: EvalExpectation;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/** Case name default: a slug of the finding title (Approach §5 step 7). */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'eval-case';
}

function toEvalCaseDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalOwnerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff,
    input_files: row.inputFiles as string[],
    input_meta: row.inputMeta as EvalCaseMeta,
    expectation: row.expectedOutput as EvalExpectation,
    source_finding_id: row.sourceFindingId,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function runRowToEvalRun(row: EvalRunRow): EvalRun {
  return {
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    traces_passed: row.tracesPassed ?? 0,
    traces_total: row.tracesTotal ?? 0,
    cases_errored: row.casesErrored,
    duration_ms: row.durationMs ?? 0,
    cost_usd: row.costUsd,
    per_case: row.perCase,
  };
}

function toEvalRunRecordDto(row: EvalRunRow, agentName: string | null): EvalRunRecord {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalOwnerKind,
    owner_id: row.ownerId,
    agent_name: agentName,
    status: row.status as EvalRunRecord['status'],
    started_at: row.ranAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
    agent_version: row.agentVersion,
    case_ids: row.caseIds,
    metrics: row.status === 'running' ? null : runRowToEvalRun(row),
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
    error_reason: row.errorReason,
  };
}

function toTrendPoint(row: EvalRunRow): EvalTrendPoint {
  const total = row.tracesTotal ?? 0;
  const passed = row.tracesPassed ?? 0;
  return {
    run_id: row.id,
    ran_at: row.ranAt.toISOString(),
    agent_version: row.agentVersion,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    pass_rate: total > 0 ? passed / total : 0,
    cost_usd: row.costUsd,
  };
}

/** Deltas over an EXPLICIT subset of cases (AC-33) — recomputed with
 *  `scoreRun`, never the stored full-set metrics, so a run whose case set
 *  changed compares apples-to-apples. */
function metricsOverCaseIds(row: EvalRunRow, caseIds: Set<string>): EvalRun {
  const filtered = row.perCase.filter((o) => caseIds.has(o.case_id));
  return scoreRun(filtered, 0);
}

function nullableDelta(a: number | null, b: number | null): number | null {
  return a == null || b == null ? null : b - a;
}

export class EvalService {
  constructor(
    private repo: EvalRepository,
    private agents: AgentLookup,
    private skills: SkillLookup,
    private resolveLlm: LlmResolver,
    private estimateCost: (model: string, tokensIn: number, tokensOut: number) => number | null,
    private logger: Logger,
    private executor: Pick<EvalExecutor, 'runCase'> = new EvalExecutor(),
  ) {}

  // ===========================================================================
  // Case creation, edit, delete (AC-1 … AC-7, AC-12 … AC-14)
  // ===========================================================================

  /** AC-1…AC-7. Returns `created: false` when D17's idempotency applies —
   *  the route maps that to 200 instead of 201. */
  async createCaseFromFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<{ case: EvalCase; created: boolean }> {
    const ctx = await this.repo.findingForCase(workspaceId, findingId);
    if (!ctx) throw new NotFoundError('Finding not found');

    if (!ctx.finding.acceptedAt && !ctx.finding.dismissedAt) {
      throw new AppError(
        'finding_not_triaged',
        'Accept or dismiss this finding before turning it into an eval case.',
        422,
      );
    }
    if (!ctx.agentId) {
      throw new AppError(
        'finding_has_no_agent',
        'This finding has no owning agent, so no eval case can be created for it.',
        422,
      );
    }

    const existing = await this.repo.getCaseBySourceFinding(workspaceId, findingId);
    if (existing) return { case: toEvalCaseDto(existing), created: false };

    // AC-3/AC-4/D17 tie-break: if both timestamps are set (re-triaged), the
    // LATER one wins — a case is never created from a stale triage state.
    const { acceptedAt, dismissedAt } = ctx.finding;
    const type: EvalExpectation['type'] =
      acceptedAt && dismissedAt
        ? acceptedAt.getTime() >= dismissedAt.getTime()
          ? 'must_find'
          : 'must_not_flag'
        : acceptedAt
          ? 'must_find'
          : 'must_not_flag';

    const patch = await this.repo.filePatch(ctx.prId, ctx.finding.file);
    if (!patch) {
      throw new AppError(
        'no_diff_available',
        `No diff text is available for '${ctx.finding.file}' on this pull request, so no frozen input could be captured.`,
        422,
      );
    }
    const frozenDiff = synthesizeFrozenDiff(ctx.finding.file, patch);
    if (Buffer.byteLength(frozenDiff, 'utf8') > MAX_FROZEN_DIFF_BYTES) {
      throw new AppError(
        'frozen_diff_too_large',
        'This file’s diff is too large to freeze as an eval case.',
        422,
      );
    }

    const expectation: EvalExpectation = {
      type,
      file: ctx.finding.file,
      start_line: ctx.finding.startLine,
      end_line: ctx.finding.endLine,
      severity: ctx.finding.severity,
      category: ctx.finding.category,
      title: ctx.finding.title,
    };
    if (!isExpectationGrounded(frozenDiff, expectation)) {
      throw new AppError(
        'expectation_not_grounded',
        'This expectation’s lines do not fall within any hunk of the frozen diff, so no finding could ever match it.',
        422,
      );
    }

    try {
      const row = await this.repo.insertCase({
        workspaceId,
        ownerKind: 'agent',
        ownerId: ctx.agentId,
        name: slugify(ctx.finding.title),
        inputDiff: frozenDiff,
        inputFiles: [ctx.finding.file],
        inputMeta: { pr_number: ctx.prNumber, title: ctx.prTitle, body: ctx.prBody },
        expectation,
        notes: null,
        sourceFindingId: findingId,
      });
      return { case: toEvalCaseDto(row), created: true };
    } catch (err) {
      // D17 belt-and-braces: a race between two rapid clicks both passing
      // the pre-check above resolves to the SAME case, never a 500.
      if (isUniqueViolation(err)) {
        const race = await this.repo.getCaseBySourceFinding(workspaceId, findingId);
        if (race) return { case: toEvalCaseDto(race), created: false };
      }
      throw err;
    }
  }

  async listCases(workspaceId: string, ownerKind: EvalOwnerKind, ownerId: string): Promise<EvalCase[]> {
    const rows = await this.repo.listCasesForOwner(workspaceId, ownerKind, ownerId);
    return rows.map(toEvalCaseDto);
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCase | undefined> {
    const row = await this.repo.getCase(workspaceId, id);
    return row ? toEvalCaseDto(row) : undefined;
  }

  /** AC-12/AC-13 — re-runs the same frozen-input/grounding validation
   *  (`createCaseFromFinding` steps 5–6) on whatever changed. AC-14: never
   *  touches `eval_runs`. */
  async updateCase(
    workspaceId: string,
    id: string,
    patch: CaseEditInput,
  ): Promise<EvalCase | undefined> {
    const existing = await this.repo.getCase(workspaceId, id);
    if (!existing) return undefined;

    const nextDiff = patch.input_diff ?? existing.inputDiff;
    const nextExpectation = patch.expectation ?? (existing.expectedOutput as EvalExpectation);
    if (patch.input_diff !== undefined || patch.expectation !== undefined) {
      if (Buffer.byteLength(nextDiff, 'utf8') > MAX_FROZEN_DIFF_BYTES) {
        throw new AppError(
          'frozen_diff_too_large',
          'This file’s diff is too large to freeze as an eval case.',
          422,
        );
      }
      if (!isExpectationGrounded(nextDiff, nextExpectation)) {
        throw new AppError(
          'expectation_not_grounded',
          'This expectation’s lines do not fall within any hunk of the frozen diff, so no finding could ever match it.',
          422,
        );
      }
    }

    const row = await this.repo.updateCase(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
      ...(patch.input_files !== undefined ? { inputFiles: patch.input_files } : {}),
      ...(patch.input_meta !== undefined ? { inputMeta: patch.input_meta } : {}),
      ...(patch.expectation !== undefined ? { expectation: patch.expectation } : {}),
    });
    return row ? toEvalCaseDto(row) : undefined;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteCase(workspaceId, id);
  }

  // ===========================================================================
  // Run lifecycle (AC-8, AC-11, AC-15, AC-23 … AC-28, AC-49)
  // ===========================================================================

  async estimate(workspaceId: string, agentId: string): Promise<EvalRunEstimate> {
    const agent = await this.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const cases = await this.repo.listCasesForOwner(workspaceId, 'agent', agentId);
    return { agents_total: 1, cases_total: cases.length, executions_total: cases.length };
  }

  /** AC-8, AC-15, AC-24, AC-49. Returns immediately with the run id; the
   *  slow part runs in the background (`reviews/service.ts:171` precedent). */
  async startRun(
    workspaceId: string,
    agentId: string,
  ): Promise<{ run_id: string; status: 'running'; estimate: EvalRunEstimate }> {
    const agent = await this.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    // D19 — reconcile this owner's stale `running` rows BEFORE the AC-15
    // guard, so a restart can never deadlock this agent's runs.
    await this.repo.reconcileStaleRunning(new Date(Date.now() - STALE_RUN_TIMEOUT_MS), {
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
    });

    const active = await this.repo.activeRunForOwner(workspaceId, 'agent', agentId);
    if (active) {
      throw new AppError(
        'run_in_flight',
        'An eval run is already in progress for this agent.',
        409,
      );
    }

    const cases = await this.repo.listCasesForOwner(workspaceId, 'agent', agentId);
    if (cases.length === 0) {
      throw new AppError('no_cases', 'This agent has no eval cases to run.', 422);
    }

    // finding 9 — resolve the LLM BEFORE creating the run row, translating
    // `ConfigError` (HTTP 500 by default) into a stated 422 with no orphan
    // run record left behind.
    let llm: LLMProvider;
    try {
      llm = await this.resolveLlm(agent.provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new AppError(
          'provider_not_configured',
          `No API key is configured for provider '${agent.provider}'.`,
          422,
        );
      }
      throw err;
    }

    const estimateResult: EvalRunEstimate = {
      agents_total: 1,
      cases_total: cases.length,
      executions_total: cases.length,
    };
    const run = await this.repo.insertRun({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
      agentVersion: agent.version,
      caseIds: cases.map((c) => c.id),
    });

    void this.executeRun(workspaceId, agent, llm, run.id, cases).catch((err) => {
      this.logger.error({ runId: run.id, err: (err as Error).message }, 'eval: background execution crashed');
    });

    return { run_id: run.id, status: 'running', estimate: estimateResult };
  }

  private async executeRun(
    _workspaceId: string,
    agent: AgentRecord,
    llm: LLMProvider,
    runId: string,
    cases: EvalCaseRow[],
  ): Promise<void> {
    const started = Date.now();
    const outcomes: ReturnType<typeof scoreCase>[] = [];
    try {
      const skillBlocks = await this.skills.enabledSkills(agent.id);
      for (const c of cases) {
        const caseStarted = Date.now();
        const expectation = c.expectedOutput as EvalExpectation;
        try {
          const result = await this.executor.runCase(agent, skillBlocks, llm, {
            inputDiff: c.inputDiff,
            inputMeta: c.inputMeta as EvalCaseMeta,
          });
          outcomes.push(
            scoreCase({
              caseId: c.id,
              name: c.name,
              expectation,
              findings: result.findings,
              groundingKept: result.groundingKept,
              groundingTotal: result.groundingTotal,
              durationMs: result.durationMs,
              costUsd: result.costUsd,
            }),
          );
        } catch (err) {
          // AC-11 — a per-case failure completes the run; the case is
          // marked errored and excluded from every metric.
          outcomes.push(
            errorCaseOutcome(
              c.id,
              c.name,
              expectation.type,
              (err as Error).message,
              Date.now() - caseStarted,
            ),
          );
        }
      }

      const metrics = scoreRun(outcomes, Date.now() - started);
      await this.repo.completeRun(runId, {
        status: 'completed',
        perCase: metrics.per_case,
        casesErrored: metrics.cases_errored,
        tracesPassed: metrics.traces_passed,
        tracesTotal: metrics.traces_total,
        recall: metrics.recall,
        precision: metrics.precision,
        citationAccuracy: metrics.citation_accuracy,
        durationMs: metrics.duration_ms,
        costUsd: metrics.cost_usd,
      });
      // Privacy of logs — counts/metrics/model/cost only, NEVER diff,
      // expectation or finding prose.
      this.logger.info(
        {
          runId,
          agentId: agent.id,
          casesTotal: cases.length,
          casesErrored: metrics.cases_errored,
          recall: metrics.recall,
          precision: metrics.precision,
          citationAccuracy: metrics.citation_accuracy,
          model: agent.model,
          durationMs: metrics.duration_ms,
          costUsd: metrics.cost_usd,
        },
        'eval run completed',
      );
    } catch (err) {
      // A crash of the whole loop (not a per-case failure) — the run is
      // never left `running`.
      await this.repo.completeRun(runId, {
        status: 'errored',
        perCase: outcomes,
        casesErrored: outcomes.length,
        tracesPassed: null,
        tracesTotal: null,
        recall: null,
        precision: null,
        citationAccuracy: null,
        durationMs: Date.now() - started,
        costUsd: null,
        errorReason: (err as Error).message,
      });
      this.logger.error({ runId, err: (err as Error).message }, 'eval run crashed');
    }
  }

  /** AC-25/AC-42 — per-agent progress/failure, never one combined result.
   *  The route's zod body (`confirm: z.literal(true)`) is what enforces
   *  AC-25's "no execution until confirmation" — by the time this runs,
   *  confirmation has already been given. */
  async runAll(workspaceId: string): Promise<EvalRunAllResult> {
    const agents = await this.agents.listEnabled(workspaceId);
    const relevant: { id: string; name: string; cases: number }[] = [];
    for (const agent of agents) {
      const cases = await this.repo.listCasesForOwner(workspaceId, 'agent', agent.id);
      if (cases.length > 0) relevant.push({ id: agent.id, name: agent.name, cases: cases.length });
    }

    const started: EvalRunAllResult['started'] = [];
    let executionsTotal = 0;
    let casesTotal = 0;
    for (const agent of relevant) {
      casesTotal += agent.cases;
      try {
        const result = await this.startRun(workspaceId, agent.id);
        executionsTotal += result.estimate.executions_total;
        started.push({
          agent_id: agent.id,
          agent_name: agent.name,
          run_id: result.run_id,
          refused_reason: null,
        });
      } catch (err) {
        started.push({
          agent_id: agent.id,
          agent_name: agent.name,
          run_id: null,
          refused_reason: err instanceof AppError ? err.message : 'Failed to start this agent’s run.',
        });
      }
    }

    return {
      estimate: { agents_total: relevant.length, cases_total: casesTotal, executions_total: executionsTotal },
      started,
    };
  }

  async getRun(workspaceId: string, id: string): Promise<EvalRunRecord | undefined> {
    const row = await this.repo.getRun(workspaceId, id);
    if (!row) return undefined;
    const agent = await this.agents.getById(workspaceId, row.ownerId);
    return toEvalRunRecordDto(row, agent?.name ?? null);
  }

  async listRuns(workspaceId: string, agentId: string): Promise<EvalRunRecord[]> {
    const agent = await this.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const rows = await this.repo.listRunsForOwner(workspaceId, 'agent', agentId);
    return rows.map((r) => toEvalRunRecordDto(r, agent.name));
  }

  // ===========================================================================
  // Compare (AC-32 … AC-34)
  // ===========================================================================

  async compare(workspaceId: string, a: string, b: string): Promise<EvalCompare> {
    if (a === b) {
      throw new AppError('invalid_compare', 'Select two distinct runs to compare.', 422);
    }
    const [runA, runB] = await Promise.all([
      this.repo.getRun(workspaceId, a),
      this.repo.getRun(workspaceId, b),
    ]);
    if (!runA || !runB) throw new NotFoundError('Eval run not found');
    if (runA.ownerKind !== runB.ownerKind || runA.ownerId !== runB.ownerId) {
      throw new AppError('invalid_compare', 'Both runs must belong to the same agent.', 422);
    }

    const [older, newer] = runA.ranAt.getTime() <= runB.ranAt.getTime() ? [runA, runB] : [runB, runA];
    const oldIds = new Set(older.caseIds);
    const newIds = new Set(newer.caseIds);
    const common_case_ids = older.caseIds.filter((id) => newIds.has(id));
    const only_in_old = older.caseIds.filter((id) => !newIds.has(id));
    const only_in_new = newer.caseIds.filter((id) => !oldIds.has(id));

    const commonSet = new Set(common_case_ids);
    const oldMetrics = metricsOverCaseIds(older, commonSet);
    const newMetrics = metricsOverCaseIds(newer, commonSet);
    const deltas = {
      recall: nullableDelta(oldMetrics.recall, newMetrics.recall),
      precision: nullableDelta(oldMetrics.precision, newMetrics.precision),
      citation_accuracy: nullableDelta(oldMetrics.citation_accuracy, newMetrics.citation_accuracy),
    };

    let prompt_diff: EvalCompare['prompt_diff'] = [];
    if (older.agentVersion != null && newer.agentVersion != null) {
      const [oldPrompt, newPrompt] = await Promise.all([
        this.repo.agentVersionPrompt(older.ownerId, older.agentVersion),
        this.repo.agentVersionPrompt(newer.ownerId, newer.agentVersion),
      ]);
      if (oldPrompt !== undefined && newPrompt !== undefined) {
        prompt_diff = diffLines(oldPrompt, newPrompt);
      }
    }

    const agent = await this.agents.getById(workspaceId, older.ownerId);
    return {
      old: toEvalRunRecordDto(older, agent?.name ?? null),
      new: toEvalRunRecordDto(newer, agent?.name ?? null),
      common_case_ids,
      only_in_old,
      only_in_new,
      deltas,
      prompt_diff,
    };
  }

  // ===========================================================================
  // Dashboard + agent detail (AC-40 … AC-48)
  // ===========================================================================

  async dashboard(workspaceId: string): Promise<EvalDashboard> {
    const agents = await this.agents.listEnabled(workspaceId);
    const summaries: EvalAgentSummary[] = [];
    for (const agent of agents) {
      const [cases, runs] = await Promise.all([
        this.repo.listCasesForOwner(workspaceId, 'agent', agent.id),
        this.repo.listRunsForOwner(workspaceId, 'agent', agent.id),
      ]);
      const completed = runs.filter((r) => r.status === 'completed');
      summaries.push({
        agent_id: agent.id,
        agent_name: agent.name,
        cases_total: cases.length,
        latest: runs[0] ? toEvalRunRecordDto(runs[0], agent.name) : null,
        trend: completed
          .slice()
          .reverse()
          .map(toTrendPoint),
      });
    }

    const recentRows = await this.repo.listRecentRuns(workspaceId, 20);
    const nameById = new Map(agents.map((a) => [a.id, a.name]));
    const recent_runs = recentRows.map((r) => toEvalRunRecordDto(r, nameById.get(r.ownerId) ?? null));

    return { agents: summaries, recent_runs };
  }

  async agentDetail(workspaceId: string, agentId: string): Promise<EvalAgentDetail> {
    const agent = await this.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const [cases, runs] = await Promise.all([
      this.repo.listCasesForOwner(workspaceId, 'agent', agentId),
      this.repo.listRunsForOwner(workspaceId, 'agent', agentId),
    ]);
    const completed = runs.filter((r) => r.status === 'completed');

    const current = completed[0] ? runRowToEvalRun(completed[0]) : null;
    const delta =
      completed.length >= 2
        ? {
            recall: nullableDelta(completed[1]!.recall, completed[0]!.recall),
            precision: nullableDelta(completed[1]!.precision, completed[0]!.precision),
            citation_accuracy: nullableDelta(
              completed[1]!.citationAccuracy,
              completed[0]!.citationAccuracy,
            ),
          }
        : null;
    const callout: EvalCallout | null =
      completed.length >= 2
        ? buildCallout(
            { metrics: runRowToEvalRun(completed[0]!), agentVersion: completed[0]!.agentVersion },
            { metrics: runRowToEvalRun(completed[1]!) },
          )
        : null;

    return {
      agent_id: agent.id,
      agent_name: agent.name,
      cases_total: cases.length,
      runs: runs.map((r) => toEvalRunRecordDto(r, agent.name)),
      current,
      delta,
      trend: completed
        .slice()
        .reverse()
        .map(toTrendPoint),
      callout,
    };
  }

  // ===========================================================================
  // Boot-time reconciliation (D19)
  // ===========================================================================

  /** Best-effort — a DB hiccup here must never block boot (server.ts wraps
   *  this in try/catch, the same posture as
   *  `reviewRepo.reapStaleRunningRuns()`). */
  async reconcileStaleRuns(): Promise<number> {
    return this.repo.reconcileStaleRunning(new Date(Date.now() - STALE_RUN_TIMEOUT_MS));
  }
}
