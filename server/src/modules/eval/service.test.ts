import { describe, it, expect, vi } from 'vitest';
import type { EvalCaseMeta, EvalExpectation } from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { EvalService } from './service.js';
import type { EvalCaseRow, EvalRunRow, FindingForCase } from './repository.js';
import type { AgentRecord } from './ports.js';

/**
 * A hand-written fake satisfying `EvalRepository`'s public surface
 * structurally — no DB, no testcontainers. Mirrors the onion-architecture
 * skill's "inject fake ports" guidance for application-service tests.
 */
class FakeEvalRepository {
  cases = new Map<string, EvalCaseRow>();
  runs = new Map<string, EvalRunRow>();
  findings = new Map<string, FindingForCase>();
  filePatches = new Map<string, string | null>();
  agentVersionPrompts = new Map<string, string>();
  private caseSeq = 0;
  private runSeq = 0;

  async findingForCase(workspaceId: string, findingId: string): Promise<FindingForCase | undefined> {
    void workspaceId;
    return this.findings.get(findingId);
  }

  async getCaseBySourceFinding(workspaceId: string, findingId: string): Promise<EvalCaseRow | undefined> {
    void workspaceId;
    return [...this.cases.values()].find((c) => c.sourceFindingId === findingId);
  }

  async filePatch(prId: string, path: string): Promise<string | null | undefined> {
    return this.filePatches.get(`${prId}:${path}`);
  }

  async agentVersionPrompt(agentId: string, version: number): Promise<string | undefined> {
    return this.agentVersionPrompts.get(`${agentId}:${version}`);
  }

  async insertCase(values: {
    workspaceId: string;
    ownerKind: 'skill' | 'agent';
    ownerId: string;
    name: string;
    inputDiff: string;
    inputFiles: string[];
    inputMeta: EvalCaseMeta;
    expectation: EvalExpectation;
    notes?: string | null;
    sourceFindingId?: string | null;
  }): Promise<EvalCaseRow> {
    if (values.sourceFindingId) {
      const clash = await this.getCaseBySourceFinding(values.workspaceId, values.sourceFindingId);
      if (clash) {
        const err = new Error('duplicate key value violates unique constraint');
        (err as { code?: string }).code = '23505';
        throw err;
      }
    }
    const id = `case-${++this.caseSeq}`;
    const now = new Date();
    const row: EvalCaseRow = {
      id,
      workspaceId: values.workspaceId,
      ownerKind: values.ownerKind,
      ownerId: values.ownerId,
      name: values.name,
      inputDiff: values.inputDiff,
      inputFiles: values.inputFiles,
      inputMeta: values.inputMeta,
      expectedOutput: values.expectation,
      notes: values.notes ?? null,
      sourceFindingId: values.sourceFindingId ?? null,
      createdAt: now,
      updatedAt: now,
    } as EvalCaseRow;
    this.cases.set(id, row);
    return row;
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const row = this.cases.get(id);
    return row?.workspaceId === workspaceId ? row : undefined;
  }

  async listCasesForOwner(workspaceId: string, ownerKind: string, ownerId: string): Promise<EvalCaseRow[]> {
    return [...this.cases.values()].filter(
      (c) => c.workspaceId === workspaceId && c.ownerKind === ownerKind && c.ownerId === ownerId,
    );
  }

  async getCasesByIds(workspaceId: string, ids: string[]): Promise<EvalCaseRow[]> {
    const idSet = new Set(ids);
    return [...this.cases.values()].filter((c) => c.workspaceId === workspaceId && idSet.has(c.id));
  }

  async updateCase(workspaceId: string, id: string, patch: Record<string, unknown>): Promise<EvalCaseRow | undefined> {
    const row = await this.getCase(workspaceId, id);
    if (!row) return undefined;
    const updated = { ...row, ...patch, updatedAt: new Date() } as EvalCaseRow;
    if ('expectation' in patch) updated.expectedOutput = patch.expectation as EvalExpectation;
    this.cases.set(id, updated);
    return updated;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const row = await this.getCase(workspaceId, id);
    if (!row) return false;
    this.cases.delete(id);
    return true;
  }

  async deleteForOwner(workspaceId: string, ownerKind: string, ownerId: string): Promise<void> {
    for (const [id, row] of this.cases) {
      if (row.workspaceId === workspaceId && row.ownerKind === ownerKind && row.ownerId === ownerId) {
        this.cases.delete(id);
      }
    }
    for (const [id, row] of this.runs) {
      if (row.workspaceId === workspaceId && row.ownerKind === ownerKind && row.ownerId === ownerId) {
        this.runs.delete(id);
      }
    }
  }

  async insertRun(values: {
    workspaceId: string;
    ownerKind: 'skill' | 'agent';
    ownerId: string;
    agentVersion: number | null;
    caseIds: string[];
  }): Promise<EvalRunRow> {
    const id = `run-${++this.runSeq}`;
    const row: EvalRunRow = {
      id,
      workspaceId: values.workspaceId,
      ownerKind: values.ownerKind,
      ownerId: values.ownerId,
      ranAt: new Date(),
      status: 'running',
      agentVersion: values.agentVersion,
      caseIds: values.caseIds,
      perCase: [],
      casesErrored: 0,
      tracesPassed: null,
      tracesTotal: null,
      finishedAt: null,
      errorReason: null,
      recall: null,
      precision: null,
      citationAccuracy: null,
      durationMs: null,
      costUsd: null,
    } as EvalRunRow;
    this.runs.set(id, row);
    return row;
  }

  async getRun(workspaceId: string, id: string): Promise<EvalRunRow | undefined> {
    const row = this.runs.get(id);
    return row?.workspaceId === workspaceId ? row : undefined;
  }

  async listRunsForOwner(workspaceId: string, ownerKind: string, ownerId: string): Promise<EvalRunRow[]> {
    return [...this.runs.values()]
      .filter((r) => r.workspaceId === workspaceId && r.ownerKind === ownerKind && r.ownerId === ownerId)
      .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime());
  }

  async listRecentRuns(workspaceId: string, limit: number): Promise<EvalRunRow[]> {
    return [...this.runs.values()]
      .filter((r) => r.workspaceId === workspaceId)
      .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())
      .slice(0, limit);
  }

  async activeRunForOwner(workspaceId: string, ownerKind: string, ownerId: string): Promise<EvalRunRow | undefined> {
    return [...this.runs.values()].find(
      (r) =>
        r.workspaceId === workspaceId &&
        r.ownerKind === ownerKind &&
        r.ownerId === ownerId &&
        r.status === 'running',
    );
  }

  async completeRun(id: string, values: Record<string, unknown>): Promise<void> {
    const row = this.runs.get(id);
    if (!row) return;
    this.runs.set(id, { ...row, ...values, finishedAt: new Date() } as EvalRunRow);
  }

  async reconcileStaleRunning(
    cutoff: Date,
    scope?: { workspaceId: string; ownerKind: string; ownerId: string },
  ): Promise<number> {
    let n = 0;
    for (const [id, row] of this.runs) {
      if (row.status !== 'running' || row.ranAt.getTime() >= cutoff.getTime()) continue;
      if (scope && (row.workspaceId !== scope.workspaceId || row.ownerKind !== scope.ownerKind || row.ownerId !== scope.ownerId)) {
        continue;
      }
      this.runs.set(id, { ...row, status: 'errored', errorReason: 'interrupted', finishedAt: new Date() });
      n++;
    }
    return n;
  }

  async agentsWithCases(workspaceId: string): Promise<string[]> {
    return [...new Set([...this.cases.values()].filter((c) => c.workspaceId === workspaceId).map((c) => c.ownerId))];
  }
}

function makeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'agent-1',
    name: 'Security Reviewer',
    provider: 'openai',
    model: 'gpt-4o-mini',
    systemPrompt: 'system',
    strategy: 'single-pass',
    version: 1,
    ...overrides,
  };
}

function makeService(
  repo: FakeEvalRepository,
  opts: {
    getById?: (workspaceId: string, id: string) => Promise<AgentRecord | null | undefined>;
    listEnabled?: (workspaceId: string) => Promise<AgentRecord[]>;
    resolveLlm?: () => Promise<unknown>;
    runCase?: () => Promise<unknown>;
  } = {},
) {
  const agents = {
    getById: opts.getById ?? (async (_ws: string, id: string) => (id === 'agent-1' ? makeAgent() : undefined)),
    listEnabled: opts.listEnabled ?? (async () => [makeAgent()]),
  };
  const skills = { enabledSkills: async () => [] };
  const resolveLlm = opts.resolveLlm ?? (async () => ({ id: 'openai' }) as never);
  const executor = { runCase: opts.runCase ?? (async () => ({
    findings: [],
    groundingKept: 0,
    groundingTotal: 0,
    tokensIn: 1,
    tokensOut: 1,
    costUsd: 0.001,
    durationMs: 1,
    assembly: {} as never,
  })) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return new EvalService(
    repo as never,
    agents as never,
    skills as never,
    resolveLlm as never,
    () => 0.001,
    logger,
    executor as never,
  );
}

describe('EvalService.createCaseFromFinding — AC-1 … AC-7', () => {
  const findingBase: FindingForCase = {
    finding: {
      id: 'finding-1',
      file: 'src/a.ts',
      startLine: 10,
      endLine: 10,
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded secret',
      acceptedAt: null,
      dismissedAt: null,
    },
    agentId: 'agent-1',
    prId: 'pr-1',
    prNumber: 42,
    prTitle: 'PR title',
    prBody: 'body',
  };
  const PATCH = '@@ -8,3 +8,4 @@\n context\n+  secret: "x",\n context';

  it('AC-2 — refuses a finding with neither accepted_at nor dismissed_at', async () => {
    const repo = new FakeEvalRepository();
    repo.findings.set('finding-1', findingBase);
    const service = makeService(repo);
    await expect(service.createCaseFromFinding('ws1', 'finding-1')).rejects.toThrow(/accept or dismiss/i);
  });

  it('AC-3 — accepted finding → must_find with the finding file/lines', async () => {
    const repo = new FakeEvalRepository();
    repo.findings.set('finding-1', {
      ...findingBase,
      finding: { ...findingBase.finding, acceptedAt: new Date() },
    });
    repo.filePatches.set('pr-1:src/a.ts', PATCH);
    const service = makeService(repo);
    const { case: evalCase, created } = await service.createCaseFromFinding('ws1', 'finding-1');
    expect(created).toBe(true);
    expect(evalCase.expectation.type).toBe('must_find');
    expect(evalCase.expectation.file).toBe('src/a.ts');
    expect(evalCase.expectation.start_line).toBe(10);
  });

  it('AC-4 — dismissed finding → must_not_flag', async () => {
    const repo = new FakeEvalRepository();
    repo.findings.set('finding-1', {
      ...findingBase,
      finding: { ...findingBase.finding, dismissedAt: new Date() },
    });
    repo.filePatches.set('pr-1:src/a.ts', PATCH);
    const service = makeService(repo);
    const { case: evalCase } = await service.createCaseFromFinding('ws1', 'finding-1');
    expect(evalCase.expectation.type).toBe('must_not_flag');
  });

  it('AC-1/D17 — activating twice returns the SAME case, not a second one', async () => {
    const repo = new FakeEvalRepository();
    repo.findings.set('finding-1', {
      ...findingBase,
      finding: { ...findingBase.finding, acceptedAt: new Date() },
    });
    repo.filePatches.set('pr-1:src/a.ts', PATCH);
    const service = makeService(repo);
    const first = await service.createCaseFromFinding('ws1', 'finding-1');
    const second = await service.createCaseFromFinding('ws1', 'finding-1');
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.case.id).toBe(first.case.id);
    expect(await repo.listCasesForOwner('ws1', 'agent', 'agent-1')).toHaveLength(1);
  });

  it('AC-6 — an expectation outside every hunk is refused and creates no case', async () => {
    const repo = new FakeEvalRepository();
    repo.findings.set('finding-1', {
      ...findingBase,
      finding: { ...findingBase.finding, acceptedAt: new Date(), startLine: 999, endLine: 999 },
    });
    repo.filePatches.set('pr-1:src/a.ts', PATCH);
    const service = makeService(repo);
    await expect(service.createCaseFromFinding('ws1', 'finding-1')).rejects.toThrow(AppError);
    expect(await repo.listCasesForOwner('ws1', 'agent', 'agent-1')).toHaveLength(0);
  });

  it('AC-6/Q4 — a null patch (PR #482 shape) is refused with a stated reason', async () => {
    const repo = new FakeEvalRepository();
    repo.findings.set('finding-1', {
      ...findingBase,
      finding: { ...findingBase.finding, acceptedAt: new Date() },
    });
    repo.filePatches.set('pr-1:src/a.ts', null);
    const service = makeService(repo);
    await expect(service.createCaseFromFinding('ws1', 'finding-1')).rejects.toThrow(/no diff text/i);
  });

  it('404s for a finding not found (or in another workspace)', async () => {
    const repo = new FakeEvalRepository();
    const service = makeService(repo);
    await expect(service.createCaseFromFinding('ws1', 'ghost')).rejects.toThrow(NotFoundError);
  });
});

describe('EvalService run lifecycle — AC-15, AC-49', () => {
  it('AC-49 — refuses to start with no cases, and creates no run record', async () => {
    const repo = new FakeEvalRepository();
    const service = makeService(repo);
    await expect(service.startRun('ws1', 'agent-1')).rejects.toThrow(/no eval cases/i);
    expect(await repo.listRunsForOwner('ws1', 'agent', 'agent-1')).toHaveLength(0);
  });

  it('AC-49/finding 9 — ConfigError from the LLM resolver surfaces as a 422, and creates no run record', async () => {
    const repo = new FakeEvalRepository();
    await repo.insertCase({
      workspaceId: 'ws1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'c1',
      inputDiff: 'd',
      inputFiles: ['f'],
      inputMeta: { pr_number: 1, title: 't', body: null },
      expectation: { type: 'must_find', file: 'f', start_line: 1, end_line: 1 },
    });
    const service = makeService(repo, {
      resolveLlm: async () => {
        throw new ConfigError('OPENAI_API_KEY is not configured');
      },
    });
    let caught: unknown;
    try {
      await service.startRun('ws1', 'agent-1');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(422);
    expect(await repo.listRunsForOwner('ws1', 'agent', 'agent-1')).toHaveLength(0);
  });

  it('AC-15 — a second start while one is in flight is refused; exactly one run exists', async () => {
    const repo = new FakeEvalRepository();
    await repo.insertCase({
      workspaceId: 'ws1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'c1',
      inputDiff: 'd',
      inputFiles: ['f'],
      inputMeta: { pr_number: 1, title: 't', body: null },
      expectation: { type: 'must_find', file: 'f', start_line: 1, end_line: 1 },
    });
    // A never-resolving executor keeps the background execution "in flight"
    // for the duration of this test (server/LEARNINGS.md's in-flight-guard
    // recipe: control timing explicitly rather than racing `Promise.all`).
    const service = makeService(repo, { runCase: () => new Promise(() => {}) });

    const first = await service.startRun('ws1', 'agent-1');
    await expect(service.startRun('ws1', 'agent-1')).rejects.toThrow(/already in progress/i);

    const runs = await repo.listRunsForOwner('ws1', 'agent', 'agent-1');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.id).toBe(first.run_id);
  });

  it('D19 — a stale running run is reconciled to errored before the guard, unblocking a new start', async () => {
    const repo = new FakeEvalRepository();
    await repo.insertCase({
      workspaceId: 'ws1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'c1',
      inputDiff: 'd',
      inputFiles: ['f'],
      inputMeta: { pr_number: 1, title: 't', body: null },
      expectation: { type: 'must_find', file: 'f', start_line: 1, end_line: 1 },
    });
    const stale = await repo.insertRun({
      workspaceId: 'ws1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      agentVersion: 1,
      caseIds: [],
    });
    // Backdate it past the staleness timeout.
    repo.runs.set(stale.id, { ...stale, ranAt: new Date(Date.now() - 20 * 60_000) });

    const service = makeService(repo, {
      runCase: async () => ({
        findings: [],
        groundingKept: 0,
        groundingTotal: 0,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0.001,
        durationMs: 1,
        assembly: {} as never,
      }),
    });
    const result = await service.startRun('ws1', 'agent-1');
    expect(result.run_id).not.toBe(stale.id);
    const staleRow = await repo.getRun('ws1', stale.id);
    expect(staleRow!.status).toBe('errored');
    expect(staleRow!.errorReason).toBe('interrupted');
  });

  it('AC-11 — a per-case throw completes the run, marks that case errored, and records cases_errored', async () => {
    const repo = new FakeEvalRepository();
    const c1 = await repo.insertCase({
      workspaceId: 'ws1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'good',
      inputDiff: 'd',
      inputFiles: ['f'],
      inputMeta: { pr_number: 1, title: 't', body: null },
      expectation: { type: 'must_find', file: 'f', start_line: 1, end_line: 1 },
    });
    await repo.insertCase({
      workspaceId: 'ws1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'boom',
      inputDiff: 'd',
      inputFiles: ['f'],
      inputMeta: { pr_number: 1, title: 't', body: null },
      expectation: { type: 'must_find', file: 'f', start_line: 1, end_line: 1 },
    });

    let call = 0;
    const service = makeService(repo, {
      runCase: async () => {
        call++;
        if (call === 2) throw new Error('provider timeout');
        return {
          findings: [{ file: 'f', start_line: 1, end_line: 1, severity: 'WARNING', category: 'bug', title: 't' }],
          groundingKept: 1,
          groundingTotal: 1,
          tokensIn: 1,
          tokensOut: 1,
          costUsd: 0.001,
          durationMs: 1,
          assembly: {} as never,
        };
      },
    });

    const started = await service.startRun('ws1', 'agent-1');
    // Background execution is fire-and-forget; wait a tick for it to settle.
    await new Promise((r) => setTimeout(r, 20));

    const row = await repo.getRun('ws1', started.run_id);
    expect(row!.status).toBe('completed');
    expect(row!.casesErrored).toBe(1);
    const errored = row!.perCase.find((o) => o.status === 'errored');
    expect(errored?.error_reason).toBe('provider timeout');
    void c1;
  });
});

describe('EvalService.updateCase / deleteCase — AC-12 … AC-14', () => {
  it('AC-14 — editing a case leaves a stored run byte-identical', async () => {
    const repo = new FakeEvalRepository();
    const c1 = await repo.insertCase({
      workspaceId: 'ws1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'original',
      inputDiff: '@@ -1,1 +1,1 @@\n-x\n+y',
      inputFiles: ['f'],
      inputMeta: { pr_number: 1, title: 't', body: null },
      expectation: { type: 'must_find', file: 'f', start_line: 1, end_line: 1 },
    });
    const run = await repo.insertRun({
      workspaceId: 'ws1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      agentVersion: 1,
      caseIds: [c1.id],
    });
    await repo.completeRun(run.id, {
      status: 'completed',
      perCase: [
        {
          case_id: c1.id,
          name: 'original',
          expectation_type: 'must_find',
          status: 'scored',
          pass: true,
          error_reason: null,
          findings_total: 1,
          findings_matched: 1,
          grounding_kept: 1,
          grounding_total: 1,
          duration_ms: 5,
          cost_usd: 0.001,
          actual: [],
        },
      ],
      casesErrored: 0,
      tracesPassed: 1,
      tracesTotal: 1,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      durationMs: 5,
      costUsd: 0.001,
    });
    const before = JSON.stringify(await repo.getRun('ws1', run.id));

    const service = makeService(repo);
    await service.updateCase('ws1', c1.id, { name: 'renamed' });
    await service.deleteCase('ws1', c1.id);

    const after = JSON.stringify(await repo.getRun('ws1', run.id));
    expect(after).toBe(before);
  });
});
