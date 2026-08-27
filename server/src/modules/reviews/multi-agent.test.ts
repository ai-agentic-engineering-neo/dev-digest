import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../platform/errors.js';
import { MultiAgentService, type AgentLookup, type AgentTarget, type ReviewRunner } from './multi-agent.js';
import type { PullRow, ReviewRow, FindingRow } from './repository.js';
import type { MultiAgentRunRow, AgentRunRow } from './repository/multi-agent.repo.js';

/**
 * Hermetic unit tests for `MultiAgentService` — same "fake repo, no DB"
 * approach as `service.test.ts`.
 */

const PULL = { id: 'pr1', repoId: 'repo1', number: 482, title: 'Add rate limiting' } as PullRow;

const AGENT_A: AgentTarget = { id: 'agent-a', name: 'Security Reviewer', provider: 'openai', model: 'gpt-4.1' };
const AGENT_B: AgentTarget = { id: 'agent-b', name: 'Perf Reviewer', provider: 'anthropic', model: 'claude-x' };

function agentRunRow(overrides: Partial<AgentRunRow> & { id: string; agentId: string | null }): AgentRunRow {
  return {
    workspaceId: 'ws1',
    prId: 'pr1',
    ranAt: new Date('2026-08-21T00:00:00Z'),
    provider: 'openai',
    model: 'gpt-4.1',
    durationMs: 1000,
    tokensIn: 10,
    tokensOut: 10,
    costUsd: 0.01,
    status: 'done',
    error: null,
    source: 'local',
    findingsCount: 0,
    grounding: '1/1 passed',
    score: 80,
    blockers: 0,
    multiAgentRunId: 'ma1',
    ...overrides,
  } as AgentRunRow;
}

function buildService(overrides?: {
  getPull?: () => Promise<PullRow | undefined>;
  inFlightMultiAgentRunForPull?: () => Promise<MultiAgentRunRow | undefined>;
  latestMultiAgentRunForPull?: () => Promise<MultiAgentRunRow | undefined>;
  createMultiAgentRun?: () => Promise<string>;
  attachRunsToMultiAgentRun?: () => Promise<void>;
  groupedRuns?: () => Promise<{ run: AgentRunRow; agentName: string | null }[]>;
  reviewsForPull?: () => Promise<{ review: ReviewRow; findings: FindingRow[] }[]>;
  getRunTrace?: () => Promise<{ config: { agent: string } } | undefined>;
  agentRunEstimates?: () => Promise<
    { agent_id: string; agent_name: string; runs: number; avg_duration_ms: number | null; avg_cost_usd: number | null }[]
  >;
  getById?: (workspaceId: string, id: string) => Promise<AgentTarget | null | undefined>;
  runReview?: () => Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[] }>;
}) {
  const repo = {
    getPull: overrides?.getPull ?? (async () => PULL),
    inFlightMultiAgentRunForPull: overrides?.inFlightMultiAgentRunForPull ?? (async () => undefined),
    latestMultiAgentRunForPull: overrides?.latestMultiAgentRunForPull ?? (async () => undefined),
    createMultiAgentRun: overrides?.createMultiAgentRun ?? (async () => 'ma1'),
    attachRunsToMultiAgentRun: overrides?.attachRunsToMultiAgentRun ?? (async () => undefined),
    groupedRuns: overrides?.groupedRuns ?? (async () => []),
    reviewsForPull: overrides?.reviewsForPull ?? (async () => []),
    getRunTrace: overrides?.getRunTrace ?? (async () => undefined),
    agentRunEstimates: overrides?.agentRunEstimates ?? (async () => []),
  } as unknown as ConstructorParameters<typeof MultiAgentService>[0];

  const agents: AgentLookup = {
    getById:
      overrides?.getById ??
      (async (_workspaceId: string, id: string) => (id === AGENT_A.id ? AGENT_A : id === AGENT_B.id ? AGENT_B : null)),
  };

  const reviews: ReviewRunner = {
    runReview:
      overrides?.runReview ??
      (async () => ({
        runs: [
          { run_id: 'run-a', agent_id: AGENT_A.id, agent_name: AGENT_A.name },
          { run_id: 'run-b', agent_id: AGENT_B.id, agent_name: AGENT_B.name },
        ],
      })),
  };

  const service = new MultiAgentService(repo, agents, reviews);
  return { service, repo, agents, reviews };
}

describe('MultiAgentService.trigger', () => {
  it('throws NotFoundError when the pull does not exist', async () => {
    const { service } = buildService({ getPull: async () => undefined });
    await expect(service.trigger('ws1', 'missing', [AGENT_A.id])).rejects.toThrow(NotFoundError);
  });

  it('AC-12: surfaces the in-flight run rather than starting a new one', async () => {
    const inFlightRow: MultiAgentRunRow = {
      id: 'ma-inflight',
      workspaceId: 'ws1',
      prId: 'pr1',
      ranAt: new Date('2026-08-20T00:00:00Z'),
    } as MultiAgentRunRow;
    const createMultiAgentRun = vi.fn(async () => 'should-not-be-called');
    const { service } = buildService({
      inFlightMultiAgentRunForPull: async () => inFlightRow,
      groupedRuns: async () => [{ run: agentRunRow({ id: 'run-a', agentId: AGENT_A.id, status: 'running' }), agentName: AGENT_A.name }],
      createMultiAgentRun,
    });
    const result = await service.trigger('ws1', 'pr1', [AGENT_A.id, AGENT_B.id]);
    expect(result.id).toBe('ma-inflight');
    expect(createMultiAgentRun).not.toHaveBeenCalled();
  });

  it('AC-14: a request mixing one valid and one foreign agent id starts zero runs and creates no multi-agent run record', async () => {
    const createMultiAgentRun = vi.fn(async () => 'ma1');
    const runReview = vi.fn(async () => ({ runs: [] }));
    const { service } = buildService({ createMultiAgentRun, runReview });
    await expect(service.trigger('ws1', 'pr1', [AGENT_A.id, 'foreign-agent'])).rejects.toThrow(NotFoundError);
    expect(createMultiAgentRun).not.toHaveBeenCalled();
    expect(runReview).not.toHaveBeenCalled();
  });

  it('AC-9, AC-13: starts one run per selected agent under one multi-agent run id, and responds before any review completes (every column running, null verdict/score/summary/error, no findings/conflicts)', async () => {
    const { service } = buildService();
    const result = await service.trigger('ws1', 'pr1', [AGENT_A.id, AGENT_B.id]);
    expect(result.id).toBe('ma1');
    expect(result.columns).toHaveLength(2);
    expect(result.columns.map((c) => c.run_id).sort()).toEqual(['run-a', 'run-b']);
    for (const col of result.columns) {
      expect(col.status).toBe('running');
      expect(col.verdict).toBeNull();
      expect(col.score).toBeNull();
      expect(col.summary).toBeNull();
      expect(col.error).toBeNull();
      expect(col.findings).toEqual([]);
    }
    expect(result.total_duration_ms).toBe(0);
    expect(result.total_cost_usd).toBeNull();
    expect(result.conflicts).toEqual([]);
  });

  it('AC-11: agent_count matches the number of selected agents', async () => {
    const { service } = buildService();
    const result = await service.trigger('ws1', 'pr1', [AGENT_A.id, AGENT_B.id]);
    expect(result.agent_count).toBe(2);
  });
});

describe('MultiAgentService.latest', () => {
  it('throws NotFoundError when the pull does not exist', async () => {
    const { service } = buildService({ getPull: async () => undefined });
    await expect(service.latest('ws1', 'missing')).rejects.toThrow(NotFoundError);
  });

  it('AC-51: returns null when the PR has no multi-agent run', async () => {
    const { service } = buildService({ latestMultiAgentRunForPull: async () => undefined });
    expect(await service.latest('ws1', 'pr1')).toBeNull();
  });

  it('assembles one AgentColumn per grouped run, with review verdict/summary merged in by run_id', async () => {
    const maRun: MultiAgentRunRow = { id: 'ma1', workspaceId: 'ws1', prId: 'pr1', ranAt: new Date('2026-08-21T00:00:00Z') } as MultiAgentRunRow;
    const review = {
      id: 'rev-a',
      workspaceId: 'ws1',
      prId: 'pr1',
      agentId: AGENT_A.id,
      runId: 'run-a',
      kind: 'review',
      verdict: 'request_changes',
      summary: 'Two blockers.',
      score: 40,
      model: 'gpt-4.1',
      createdAt: new Date(),
    } as ReviewRow;
    const findingA = {
      id: 'f1',
      reviewId: 'rev-a',
      file: 'src/foo.ts',
      startLine: 10,
      endLine: 10,
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded secret',
      rationale: 'A secret is committed.',
      suggestion: null,
      confidence: 0.9,
      kind: 'secret_leak',
      trifectaComponents: null,
      acceptedAt: null,
      dismissedAt: null,
    } as FindingRow;

    const { service } = buildService({
      latestMultiAgentRunForPull: async () => maRun,
      groupedRuns: async () => [
        { run: agentRunRow({ id: 'run-a', agentId: AGENT_A.id, status: 'done', score: 40 }), agentName: AGENT_A.name },
        { run: agentRunRow({ id: 'run-b', agentId: AGENT_B.id, status: 'running', score: null, durationMs: null, costUsd: null }), agentName: AGENT_B.name },
      ],
      reviewsForPull: async () => [{ review, findings: [findingA] }],
    });

    const result = await service.latest('ws1', 'pr1');
    expect(result).not.toBeNull();
    const colA = result!.columns.find((c) => c.run_id === 'run-a')!;
    expect(colA.verdict).toBe('request_changes');
    expect(colA.summary).toBe('Two blockers.');
    expect(colA.score).toBe(40);
    expect(colA.findings).toHaveLength(1);
    expect(colA.findings[0]!.file).toBe('src/foo.ts');
    const colB = result!.columns.find((c) => c.run_id === 'run-b')!;
    expect(colB.status).toBe('running');
    expect(colB.verdict).toBeNull();
  });

  it('AC-24: total_duration_ms is the MAX of finished durations; total_cost_usd is the SUM unless any grouped cost is unknown', async () => {
    const maRun: MultiAgentRunRow = { id: 'ma1', workspaceId: 'ws1', prId: 'pr1', ranAt: new Date() } as MultiAgentRunRow;
    const { service } = buildService({
      latestMultiAgentRunForPull: async () => maRun,
      groupedRuns: async () => [
        { run: agentRunRow({ id: 'run-a', agentId: AGENT_A.id, durationMs: 8200, costUsd: 0.06 }), agentName: AGENT_A.name },
        { run: agentRunRow({ id: 'run-b', agentId: AGENT_B.id, durationMs: 3100, costUsd: 0.04 }), agentName: AGENT_B.name },
      ],
    });
    const result = await service.latest('ws1', 'pr1');
    expect(result!.total_duration_ms).toBe(8200);
    expect(result!.total_cost_usd).toBeCloseTo(0.1);
  });

  it('AC-24: total_cost_usd is null (not $0) when any grouped run has an unknown cost', async () => {
    const maRun: MultiAgentRunRow = { id: 'ma1', workspaceId: 'ws1', prId: 'pr1', ranAt: new Date() } as MultiAgentRunRow;
    const { service } = buildService({
      latestMultiAgentRunForPull: async () => maRun,
      groupedRuns: async () => [
        { run: agentRunRow({ id: 'run-a', agentId: AGENT_A.id, costUsd: 0.06 }), agentName: AGENT_A.name },
        { run: agentRunRow({ id: 'run-b', agentId: AGENT_B.id, costUsd: null }), agentName: AGENT_B.name },
      ],
    });
    const result = await service.latest('ws1', 'pr1');
    expect(result!.total_cost_usd).toBeNull();
  });

  it('falls back to the run trace agent name when agent_runs.agent_id is null (deleted agent), never crashing', async () => {
    const maRun: MultiAgentRunRow = { id: 'ma1', workspaceId: 'ws1', prId: 'pr1', ranAt: new Date() } as MultiAgentRunRow;
    const { service } = buildService({
      latestMultiAgentRunForPull: async () => maRun,
      groupedRuns: async () => [{ run: agentRunRow({ id: 'run-a', agentId: null }), agentName: null }],
      getRunTrace: async () => ({ config: { agent: 'Security Reviewer (deleted)' } }),
    });
    const result = await service.latest('ws1', 'pr1');
    expect(result!.columns[0]!.agent_name).toBe('Security Reviewer (deleted)');
    expect(result!.columns[0]!.agent_id).toBe('run-a'); // stable fallback identity
  });

  it('AC-54: rejects a shape violation at the boundary rather than partially rendering it', async () => {
    const maRun: MultiAgentRunRow = { id: 'ma1', workspaceId: 'ws1', prId: 'pr1', ranAt: new Date() } as MultiAgentRunRow;
    const { service } = buildService({
      latestMultiAgentRunForPull: async () => maRun,
      // an impossible status value the shared MultiAgentRun schema will reject
      groupedRuns: async () => [{ run: agentRunRow({ id: 'run-a', agentId: AGENT_A.id, status: 'bogus-status' as any }), agentName: AGENT_A.name }],
    });
    await expect(service.latest('ws1', 'pr1')).rejects.toThrow();
  });
});

describe('MultiAgentService.estimates', () => {
  it('AC-5: passes through per-agent averages, with null meaning no completed run', async () => {
    const { service } = buildService({
      agentRunEstimates: async () => [
        { agent_id: AGENT_A.id, agent_name: AGENT_A.name, runs: 3, avg_duration_ms: 8200, avg_cost_usd: 0.06 },
        { agent_id: AGENT_B.id, agent_name: AGENT_B.name, runs: 0, avg_duration_ms: null, avg_cost_usd: null },
      ],
    });
    const result = await service.estimates('ws1');
    expect(result).toHaveLength(2);
    expect(result[1]!.avg_duration_ms).toBeNull();
    expect(result[1]!.avg_cost_usd).toBeNull();
  });
});
