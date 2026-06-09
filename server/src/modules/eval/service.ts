import type { Container } from '../../platform/container.js';
import type { Provider, Review, EvalRun } from '@devdigest/shared';
import { Review as ReviewSchema } from '@devdigest/shared';
import type {
  EvalCaseInput,
  EvalDashboard,
  EvalRunRecord,
  EvalRunResult,
} from '@devdigest/shared/contracts/eval-ci';
import { assemblePrompt } from '../../platform/prompt.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { groundFindings } from '../../platform/grounding.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { EvalRepository, type EvalCaseRow, type EvalRunRow } from './repository.js';
import { expectedFindings } from './helpers.js';
import { score, aggregate } from './scoring.js';
import { dashboard, runToRecord } from './dashboard.js';

/**
 * A4 — Eval pipeline (§7 L06). For a case whose owner is an *agent*, we run the
 * agent on the case's `input_diff` (synthetic PR), ground the findings against
 * the diff, then compare actual vs `expected_output` to compute:
 *   - recall            = matched expected / expected_total
 *   - precision         = matched expected / actual_total
 *   - citation_accuracy = grounded findings / actual_total
 * A case passes when recall === 1 and precision === 1 (every expected finding
 * found, no extras). Metrics + actual output are persisted to `eval_runs`.
 *
 * For skill-owned cases (no runnable agent) we degrade gracefully: the case can
 * still be stored/edited; running it requires resolving an agent (400 if none).
 */
export class EvalService {
  private repo: EvalRepository;
  private agents: Container['agentsRepo'];

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
    this.agents = container.agentsRepo;
  }

  // ---- CRUD ---------------------------------------------------------------

  async listCases(
    workspaceId: string,
    filter?: { ownerKind?: 'agent' | 'skill'; ownerId?: string },
  ): Promise<(EvalCaseRow & { last_run?: EvalRunRecord })[]> {
    const cases = await this.repo.listCases(workspaceId, filter);
    const runs = await this.repo.runsForCases(cases.map((c) => c.id));
    const byCase = new Map<string, EvalRunRow>();
    for (const r of runs) if (!byCase.has(r.caseId)) byCase.set(r.caseId, r); // newest first
    return cases.map((c) => {
      const last = byCase.get(c.id);
      return { ...c, last_run: last ? runToRecord(last, c.name) : undefined };
    });
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow> {
    const row = await this.repo.getCase(workspaceId, id);
    if (!row) throw new NotFoundError('Eval case not found');
    return row;
  }

  async createCase(workspaceId: string, input: EvalCaseInput): Promise<EvalCaseRow> {
    return this.repo.insertCase({
      workspaceId,
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      inputDiff: input.input_diff ?? '',
      inputFiles: input.input_files ?? null,
      inputMeta: input.input_meta ?? null,
      expectedOutput: input.expected_output ?? null,
      notes: input.notes ?? null,
    });
  }

  async updateCase(
    workspaceId: string,
    id: string,
    input: Partial<EvalCaseInput>,
  ): Promise<EvalCaseRow> {
    await this.getCase(workspaceId, id);
    const row = await this.repo.updateCase(workspaceId, id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.input_diff !== undefined ? { inputDiff: input.input_diff } : {}),
      ...(input.input_files !== undefined ? { inputFiles: input.input_files } : {}),
      ...(input.input_meta !== undefined ? { inputMeta: input.input_meta } : {}),
      ...(input.expected_output !== undefined ? { expectedOutput: input.expected_output } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.owner_kind !== undefined ? { ownerKind: input.owner_kind } : {}),
      ...(input.owner_id !== undefined ? { ownerId: input.owner_id } : {}),
    });
    return row!;
  }

  async deleteCase(workspaceId: string, id: string): Promise<void> {
    await this.getCase(workspaceId, id);
    await this.repo.deleteCase(workspaceId, id);
  }

  // ---- Run a case ---------------------------------------------------------

  async runCase(workspaceId: string, caseId: string): Promise<EvalRunResult> {
    const ec = await this.getCase(workspaceId, caseId);
    const { review, costUsd, durationMs } = await this.runOwnerOnDiff(workspaceId, ec);

    const diff = parseUnifiedDiff(ec.inputDiff ?? '');
    const ground = groundFindings(review.findings, diff);
    const actual = ground.kept;

    const expected = expectedFindings(ec.expectedOutput);
    const metrics = score(expected, actual, review.findings.length);

    const pass = metrics.recall === 1 && metrics.precision === 1;

    const run = await this.repo.insertRun({
      caseId: ec.id,
      actualOutput: { verdict: review.verdict, score: review.score, findings: actual },
      pass,
      recall: metrics.recall,
      precision: metrics.precision,
      citationAccuracy: metrics.citation_accuracy,
      durationMs,
      costUsd,
    });

    const result: EvalRun = {
      recall: metrics.recall,
      precision: metrics.precision,
      citation_accuracy: metrics.citation_accuracy,
      traces_passed: pass ? 1 : 0,
      traces_total: 1,
      duration_ms: durationMs,
      cost_usd: costUsd,
      per_trace: [
        {
          name: ec.name,
          pass,
          expected,
          actual,
        },
      ],
    };

    return { run_id: run.id, case_id: ec.id, result };
  }

  /** Run every case owned by an agent (the agent-editor "Run all"). */
  async runAllForAgent(workspaceId: string, agentId: string): Promise<EvalRun> {
    const cases = await this.repo.listCases(workspaceId, { ownerKind: 'agent', ownerId: agentId });
    if (cases.length === 0) {
      return {
        recall: 0,
        precision: 0,
        citation_accuracy: 0,
        traces_passed: 0,
        traces_total: 0,
        duration_ms: 0,
        cost_usd: 0,
        per_trace: [],
      };
    }
    const results = await Promise.all(cases.map((c) => this.runCase(workspaceId, c.id)));
    return aggregate(results.map((r) => r.result));
  }

  // ---- Dashboard ----------------------------------------------------------

  async dashboard(
    workspaceId: string,
    filter?: { ownerKind?: 'agent' | 'skill'; ownerId?: string },
  ): Promise<EvalDashboard> {
    return dashboard(this.repo, workspaceId, filter);
  }

  // ---- Helpers ------------------------------------------------------------

  /** Resolve the owning agent + run it on the synthetic diff → a Review. */
  private async runOwnerOnDiff(
    workspaceId: string,
    ec: EvalCaseRow,
  ): Promise<{ review: Review; costUsd: number | null; durationMs: number }> {
    const agent = await this.resolveAgent(workspaceId, ec);
    const llm = await this.container.llm(agent.provider as Provider);
    const skillBodies = await this.collectSkills(agent.id);
    const meta = (ec.inputMeta ?? {}) as { title?: string; body?: string };

    const { messages } = assemblePrompt({
      system: agent.systemPrompt,
      skills: skillBodies,
      diff: ec.inputDiff ?? '',
      task: `Eval case "${ec.name}". Review the diff${
        meta.title ? ` for PR "${meta.title}"` : ''
      } and return findings, each citing an exact file and line range present in the diff.`,
    });

    const start = Date.now();
    const res = await llm.completeStructured<Review>({
      model: agent.model,
      schema: ReviewSchema,
      schemaName: 'Review',
      messages,
      maxRetries: 2,
    });
    return { review: res.data, costUsd: res.costUsd, durationMs: Date.now() - start };
  }

  /**
   * Resolve a runnable agent for the case. Agent-owned → that agent. Skill-owned
   * → an enabled agent that links the skill (so the rubric is actually applied),
   * else any enabled agent. 400 if none exist.
   */
  private async resolveAgent(workspaceId: string, ec: EvalCaseRow) {
    if (ec.ownerKind === 'agent') {
      const agent = await this.agents.getById(workspaceId, ec.ownerId);
      if (!agent) throw new NotFoundError('Owner agent not found');
      return agent;
    }
    const enabled = await this.agents.listEnabled(workspaceId);
    for (const a of enabled) {
      const ids = await this.agents.skillIdsForAgent(a.id);
      if (ids.includes(ec.ownerId)) return a;
    }
    if (enabled[0]) return enabled[0];
    throw new AppError('no_runnable_agent', 'No enabled agent available to run this eval case', 400);
  }

  private async collectSkills(agentId: string): Promise<string[]> {
    const links = await this.agents.linkedSkills(agentId);
    return links.filter((l) => l.skill.enabled).map((l) => `### ${l.skill.name}\n${l.skill.body}`);
  }
}
