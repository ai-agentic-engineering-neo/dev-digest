import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GitHubClient } from '@devdigest/shared';
import { CiService, type CiExportOptions } from './service.js';
import type { CiRepository, PerfRangeRow } from './repository.js';
import type { AgentLookup, AgentRecord, MemoryReader, RepoLookup, SkillLookup } from './ports.js';
import { MockSecretsProvider } from '../../adapters/mocks.js';
import { NotFoundError } from '../../platform/errors.js';
import { WORKFLOW_PATH } from './constants.js';

/**
 * specs/14-export-to-ci.md (P4, `CiService.previewFile`) — the on-demand
 * runner-bundle-file preview. Application-service test: fake ports
 * (onion-architecture skill's "inject fake ports" guidance, same shape as
 * `eval/service.test.ts`), no DB, no HTTP, no LLM. `runnerBundleDir` points
 * at a REAL temp directory because `buildBundle`/`readRunnerBundleDir` do a
 * real `fs` read for it — only `listRunnerBundleFiles`/`readFile` (not used
 * by the service) are the injectable seams `bundle.test.ts` exercises directly.
 */

const WORKSPACE_ID = 'ws-1';
const AGENT_ID = 'agent-1';

const AGENT: AgentRecord = {
  id: AGENT_ID,
  name: 'Security Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'Review the diff for security issues.',
  strategy: 'auto',
  ciFailOn: 'critical',
};

class FakeAgentLookup implements AgentLookup {
  async getById(workspaceId: string, id: string): Promise<AgentRecord | undefined> {
    return workspaceId === WORKSPACE_ID && id === AGENT_ID ? AGENT : undefined;
  }
}

class FakeSkillLookup implements SkillLookup {
  async enabledSkills() {
    return [{ slug: 'no-secrets', body: 'Do not leak API keys.' }];
  }
}

class FakeMemoryReader implements MemoryReader {
  async listRepoScoped() {
    return [];
  }
}

class FakeRepoLookup implements RepoLookup {
  async findByFullName() {
    return undefined;
  }
}

function neverCalledGithubClient(): () => Promise<GitHubClient> {
  return () => Promise.reject(new Error('previewFile must never resolve a GitHub client'));
}

describe('CiService.previewFile', () => {
  let runnerBundleDir: string;

  beforeAll(() => {
    runnerBundleDir = mkdtempSync(join(tmpdir(), 'ci-service-test-'));
    writeFileSync(join(runnerBundleDir, 'index.js'), "console.log('runner');");
    writeFileSync(join(runnerBundleDir, 'package.json'), '{"type":"module"}');
  });

  afterAll(() => {
    rmSync(runnerBundleDir, { recursive: true, force: true });
  });

  function makeService(): CiService {
    return new CiService(
      {} as CiRepository, // never called by generateFiles/previewFile
      new FakeAgentLookup(),
      new FakeSkillLookup(),
      new FakeMemoryReader(),
      new FakeRepoLookup(),
      neverCalledGithubClient(),
      runnerBundleDir,
      new MockSecretsProvider({}),
    );
  }

  const OPTS: CiExportOptions = {
    repo: 'acme/target',
    target: 'gha',
    action: 'files',
    post_as: 'github_review',
    triggers: ['opened', 'synchronize'],
    base: 'main',
  };

  it('fetching a valid path returns that file’s real content', async () => {
    const service = makeService();
    const file = await service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, WORKFLOW_PATH);
    expect(file.path).toBe(WORKFLOW_PATH);
    expect(file.contents).toEqual(expect.any(String));
    expect(file.contents!.length).toBeGreaterThan(0);
    expect(file.bytes).toBe(Buffer.byteLength(file.contents!, 'utf8'));
  });

  it('an unrecognized path 404s — never a filesystem lookup keyed on the client-supplied string', async () => {
    const service = makeService();
    // A directory-traversal-shaped path: if this were ever used as a real fs
    // path (instead of matched against the pre-generated file list), it
    // would attempt to read outside the runner bundle directory entirely.
    // The correct behaviour is a clean 404, not an fs error of any kind.
    await expect(
      service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, '../../../../../../etc/passwd'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a well-formed but non-existent bundle path also 404s (exact match only, no partial/prefix match)', async () => {
    const service = makeService();
    await expect(
      service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, '.devdigest/runner/does-not-exist.js'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('AC-9 — deterministic: the same path/config returns byte-identical contents/bytes/sha256 across calls', async () => {
    const service = makeService();
    const first = await service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, WORKFLOW_PATH);
    const second = await service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, WORKFLOW_PATH);
    expect(second).toEqual(first);
  });

  it('never resolves the GitHub client — no network call, no LLM call, generation is pure', async () => {
    const service = makeService();
    // `neverCalledGithubClient` rejecting if invoked means this call would
    // itself reject if `previewFile` ever touched GitHub. `CiService` has no
    // LLM dependency at all (see its constructor) — there is structurally no
    // LLM call this path could make.
    await expect(service.previewFile(WORKSPACE_ID, AGENT_ID, OPTS, WORKFLOW_PATH)).resolves.toBeDefined();
  });

  it('throws NotFoundError for an unknown agent before any bundle is generated', async () => {
    const service = makeService();
    await expect(
      service.previewFile(WORKSPACE_ID, 'no-such-agent', OPTS, WORKFLOW_PATH),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/**
 * plans/16-agent-performance-dashboard.md — `CiService.agentPerformance`,
 * hermetic (fake `CiRepository`/`AgentLookup`, no DB). Covers range
 * resolution (AC "same rules for {days} and {from,to}"), AC-3 ("most active"
 * tracks the SELECTED period, never a synthesized zero-run row, and is null
 * when nobody ran"), AC-2 (summary totals reconcile with the per-row sums),
 * and clarification #7 (pooled avg_accept_rate, not an unweighted mean).
 */
describe('CiService.agentPerformance', () => {
  function perfRow(overrides: Partial<PerfRangeRow> & { agentId: string }): PerfRangeRow {
    return {
      runsLocal: 0,
      runsCi: 0,
      countedRuns: 0,
      costedRuns: 0,
      timedRuns: 0,
      totalCostUsd: null,
      totalDurationMs: null,
      totalFindings: 0,
      lastRunAt: null,
      accepted: 0,
      dismissed: 0,
      pending: 0,
      costProvider: null,
      costEstimated: null,
      costUnknown: null,
      runsByDay: [],
      ...overrides,
    };
  }

  function agentRecord(id: string, name: string): AgentRecord {
    return { id, name, provider: 'openai', model: 'gpt-4.1', systemPrompt: '', strategy: 'auto', ciFailOn: 'critical' };
  }

  /** `agentPerformance` calls `performanceRows` exactly twice, in order:
   *  the SELECTED period first, then the immediately-preceding period for
   *  deltas (`CiService.agentPerformance`'s own `Promise.all` array order).
   *  This fake records every call and serves canned rows by call index so a
   *  test can assert on exactly what range each call received. */
  class FakePerfRepo {
    calls: { from: Date; to: Date; agentId?: string }[] = [];
    constructor(
      private responses: PerfRangeRow[][],
      private costByModelRows: { model: string; cost: number }[] = [],
    ) {}
    async performanceRows(_workspaceId: string, from: Date, to: Date, agentId?: string): Promise<PerfRangeRow[]> {
      const idx = this.calls.length;
      this.calls.push({ from, to, agentId });
      return this.responses[idx] ?? [];
    }
    async costByModel(): Promise<{ model: string; cost: number }[]> {
      return this.costByModelRows;
    }
  }

  class FakeAgentLookupList implements AgentLookup {
    constructor(private agents: AgentRecord[]) {}
    async getById(_workspaceId: string, id: string) {
      return this.agents.find((a) => a.id === id);
    }
    async list() {
      return this.agents;
    }
  }

  function makeService(
    repo: FakePerfRepo,
    agentLookup: AgentLookup,
  ): CiService {
    return new CiService(
      repo as unknown as CiRepository,
      agentLookup,
      new FakeSkillLookup(),
      new FakeMemoryReader(),
      new FakeRepoLookup(),
      neverCalledGithubClient(),
      '',
      new MockSecretsProvider({}),
    );
  }

  it('resolves a `{ days }` range to a real [from,to) span and threads it to both the current and prior-period query', async () => {
    const repo = new FakePerfRepo([[], []]);
    const service = makeService(repo, new FakeAgentLookupList([]));

    const result = await service.agentPerformance(WORKSPACE_ID, { days: 7 });

    expect(repo.calls).toHaveLength(2); // current period, then prior period
    const [current, prior] = repo.calls;
    expect(current!.to.getTime() - current!.from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    // The prior-period call is the immediately-preceding equal-length window.
    expect(prior!.to.getTime()).toBe(current!.from.getTime());
    expect(prior!.to.getTime() - prior!.from.getTime()).toBe(current!.to.getTime() - current!.from.getTime());
    expect(result.summary.range_days).toBe(7);
  });

  it('resolves a custom `{ from, to }` range verbatim, with range_days null (D12/AC-43)', async () => {
    const repo = new FakePerfRepo([[], []]);
    const service = makeService(repo, new FakeAgentLookupList([]));
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-10T00:00:00Z');

    const result = await service.agentPerformance(WORKSPACE_ID, { from, to });

    expect(repo.calls[0]).toMatchObject({ from, to });
    expect(result.summary.range_days).toBeNull();
    expect(result.summary.range).toEqual({ from: from.toISOString(), to: to.toISOString() });
  });

  it('AC-3 — most_active_agent tracks run count in the SELECTED period, not the prior period, and ignores zero-run agents', async () => {
    // Agent A: 5 runs THIS period, 1 run last period.
    // Agent B: 2 runs THIS period, 50 runs last period (would win on an
    // all-time/prior-period basis, but must NOT win here).
    // Agent C: in the workspace roster but zero runs in either period — the
    // service must synthesize a zero row for it (AC-4 gap fix) without ever
    // letting a zero-run row become "most active".
    const current: PerfRangeRow[] = [
      perfRow({ agentId: 'A', runsLocal: 5 }),
      perfRow({ agentId: 'B', runsLocal: 2 }),
    ];
    const prior: PerfRangeRow[] = [
      perfRow({ agentId: 'A', runsLocal: 1 }),
      perfRow({ agentId: 'B', runsLocal: 50 }),
    ];
    const repo = new FakePerfRepo([current, prior]);
    const agentLookup = new FakeAgentLookupList([
      agentRecord('A', 'Agent A'),
      agentRecord('B', 'Agent B'),
      agentRecord('C', 'Agent C'),
    ]);
    const service = makeService(repo, agentLookup);

    const result = await service.agentPerformance(WORKSPACE_ID, { days: 30 });

    expect(result.summary.most_active_agent).toBe('Agent A');
    const rowC = result.agents.find((a) => a.agent_id === 'C');
    expect(rowC?.runs).toBe(0); // synthesized zero row, not missing entirely
  });

  it('AC-3 — most_active_agent is null (never an arbitrary zero-run agent) when every agent in the workspace had zero runs in period', async () => {
    const repo = new FakePerfRepo([[], []]);
    const agentLookup = new FakeAgentLookupList([agentRecord('D', 'Agent D')]);
    const service = makeService(repo, agentLookup);

    const result = await service.agentPerformance(WORKSPACE_ID, { days: 30 });

    expect(result.summary.most_active_agent).toBeNull();
    expect(result.summary.runs).toBe(0);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]!.runs).toBe(0);
  });

  it('AC-2 — summary.total_cost_usd, cost_by_agent, and cost_by_model each sum to the SAME total as the per-agent rows', async () => {
    const current: PerfRangeRow[] = [
      perfRow({ agentId: 'A', runsLocal: 4, countedRuns: 4, costedRuns: 4, totalCostUsd: 10 }),
      perfRow({ agentId: 'B', runsLocal: 2, countedRuns: 2, costedRuns: 2, totalCostUsd: 5 }),
    ];
    const repo = new FakePerfRepo([current, []], [
      { model: 'gpt-4.1', cost: 9 },
      { model: 'claude-4', cost: 6 },
    ]);
    const agentLookup = new FakeAgentLookupList([agentRecord('A', 'Agent A'), agentRecord('B', 'Agent B')]);
    const service = makeService(repo, agentLookup);

    const result = await service.agentPerformance(WORKSPACE_ID, { days: 30 });

    const perAgentSum = result.agents.reduce((sum, r) => sum + (r.total_cost_usd ?? 0), 0);
    const byAgentSum = result.cost_by_agent.reduce((sum, e) => sum + e.value, 0);
    const byModelSum = result.cost_by_model.reduce((sum, e) => sum + e.value, 0);

    expect(result.summary.total_cost_usd).toBe(15);
    expect(perAgentSum).toBe(15);
    expect(byAgentSum).toBe(15);
    expect(byModelSum).toBe(15);
    expect(result.summary.runs).toBe(6); // 4 + 2, sums the per-agent `runs`
  });

  it('clarification #7 — summary.avg_accept_rate is the POOLED rate (sum accepted / sum decisions), not an unweighted mean of per-agent rates', async () => {
    // Agent A: 1/2 = 0.5. Agent B: 18/20 = 0.9. Unweighted mean = 0.7.
    // Pooled = (1+18)/(2+20) = 19/22 ≈ 0.8636 — must reconcile with AC-2's
    // "totals sum correctly" the same way total_cost_usd already does.
    const current: PerfRangeRow[] = [
      perfRow({ agentId: 'A', runsLocal: 2, accepted: 1, dismissed: 1 }),
      perfRow({ agentId: 'B', runsLocal: 20, accepted: 18, dismissed: 2 }),
    ];
    const repo = new FakePerfRepo([current, []]);
    const agentLookup = new FakeAgentLookupList([agentRecord('A', 'Agent A'), agentRecord('B', 'Agent B')]);
    const service = makeService(repo, agentLookup);

    const result = await service.agentPerformance(WORKSPACE_ID, { days: 30 });

    expect(result.summary.avg_accept_rate).toBeCloseTo(19 / 22, 10);
    expect(result.summary.avg_accept_rate).not.toBeCloseTo(0.7, 2);
  });

  it('a row with no prior-period counterpart gets null deltas, while a row with one gets a real delta', async () => {
    const current: PerfRangeRow[] = [
      perfRow({ agentId: 'A', runsLocal: 5 }), // no prior row for A at all
      perfRow({ agentId: 'B', runsLocal: 5 }),
    ];
    const prior: PerfRangeRow[] = [perfRow({ agentId: 'B', runsLocal: 2 })];
    const repo = new FakePerfRepo([current, prior]);
    const agentLookup = new FakeAgentLookupList([agentRecord('A', 'Agent A'), agentRecord('B', 'Agent B')]);
    const service = makeService(repo, agentLookup);

    const result = await service.agentPerformance(WORKSPACE_ID, { days: 30 });

    const rowA = result.agents.find((a) => a.agent_id === 'A')!;
    const rowB = result.agents.find((a) => a.agent_id === 'B')!;
    expect(rowA.runs_delta).toBeNull();
    expect(rowB.runs_delta).toBe(3); // 5 - 2
  });
});
