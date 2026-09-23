import { describe, it, expect } from 'vitest';
import type { GitHubClient } from '@devdigest/shared';
import { AgentsService, type PerformanceRowSource } from './service.js';
import type { AgentsRepository } from './repository.js';
import type { PerfSourceRow } from '../_shared/perf.js';
import { CiService } from '../ci/service.js';
import type { CiRepository, PerfRangeRow } from '../ci/repository.js';
import type { AgentLookup, AgentRecord, MemoryReader, RepoLookup, SkillLookup } from '../ci/ports.js';
import { MockSecretsProvider } from '../../adapters/mocks.js';

/**
 * plans/16-agent-performance-dashboard.md — hermetic unit tests (fake
 * `AgentsRepository`/`PerformanceRowSource`, no DB), same "fake repo, no DB"
 * approach as `reviews/service.test.ts` and `ci/service.test.ts`.
 *
 * AC-1's "matches the per-agent Stats view for the same agent and period" is
 * verified LITERALLY below (not just re-asserted): `CiService.agentPerformance`
 * and `AgentsService.stats` are called against the SAME underlying
 * `PerfRangeRow`/`PerfSourceRow` fixture for one agent, and their outputs are
 * compared field-by-field.
 */

const WORKSPACE_ID = 'ws-1';
const AGENT_ID = 'agent-1';

function fakeAgentsRepo(agent: { id: string; name: string } | undefined): AgentsRepository {
  return {
    async getById(workspaceId: string, id: string) {
      if (workspaceId !== WORKSPACE_ID || !agent || agent.id !== id) return undefined;
      // Only `.name` is read by `AgentsService.stats` — everything else is
      // irrelevant to this port's one caller.
      return { id: agent.id, name: agent.name } as unknown as Awaited<ReturnType<AgentsRepository['getById']>>;
    },
  } as unknown as AgentsRepository;
}

function fixtureRow(agentId: string): PerfRangeRow & PerfSourceRow {
  // A realistic mixed workload: 4 raw runs (3 done, 1 failed — D1's
  // running/failed exclusion), cost known for 3 of them, duration known for
  // all 4 (a failed run still records a real durationMs per
  // server/LEARNINGS.md), 12/15 decisions (low_sample stays true, < 20).
  return {
    agentId,
    runsLocal: 4,
    runsCi: 0,
    countedRuns: 3,
    costedRuns: 3,
    timedRuns: 4,
    totalCostUsd: 6,
    totalDurationMs: 8000,
    totalFindings: 9,
    lastRunAt: new Date('2026-09-20T12:00:00Z'),
    accepted: 12,
    dismissed: 3,
    pending: 1,
    costProvider: 4,
    costEstimated: 2,
    costUnknown: null,
    runsByDay: [{ day: '2026-09-20', count: 4 }],
  };
}

// ---- Minimal fakes for CiService's other, unused-here constructor args ----

class NoopSkillLookup implements SkillLookup {
  async enabledSkills() {
    return [];
  }
}
class NoopMemoryReader implements MemoryReader {
  async listRepoScoped() {
    return [];
  }
}
class NoopRepoLookup implements RepoLookup {
  async findByFullName() {
    return undefined;
  }
}
function neverCalledGithubClient(): () => Promise<GitHubClient> {
  return () => Promise.reject(new Error('agentPerformance must never resolve a GitHub client'));
}

describe('AgentsService.stats', () => {
  it('returns undefined for an agent that does not exist in this workspace (route 404s)', async () => {
    const service = new AgentsService(fakeAgentsRepo(undefined), async () => {
      throw new Error('llm must not be called');
    });
    const result = await service.stats(WORKSPACE_ID, 'no-such-agent', { days: 30 });
    expect(result).toBeUndefined();
  });

  it('throws when no PerformanceRowSource is wired — a real construction bug, not a silent empty result', async () => {
    const service = new AgentsService(fakeAgentsRepo({ id: AGENT_ID, name: 'Reviewer' }), async () => {
      throw new Error('llm must not be called');
    });
    await expect(service.stats(WORKSPACE_ID, AGENT_ID, { days: 30 })).rejects.toThrow(/PerformanceRowSource/);
  });

  it('an agent with zero runs in the selected period renders honest zeros/nulls, not a missing row (AC-4)', async () => {
    const perf: PerformanceRowSource = { performanceRows: async () => [] };
    const service = new AgentsService(
      fakeAgentsRepo({ id: AGENT_ID, name: 'Reviewer' }),
      async () => {
        throw new Error('llm must not be called');
      },
      undefined,
      perf,
    );
    const stats = await service.stats(WORKSPACE_ID, AGENT_ID, { days: 30 });
    expect(stats).toBeDefined();
    expect(stats!.runs).toBe(0);
    expect(stats!.accept_rate).toBeNull();
    expect(stats!.avg_cost_usd).toBeNull();
    expect(stats!.avg_latency_ms).toBeNull();
    expect(stats!.total_cost_usd).toBeNull();
    expect(stats!.low_sample).toBe(true);
  });

  it('scopes the performanceRows call to the requested agentId', async () => {
    const calls: (string | undefined)[] = [];
    const perf: PerformanceRowSource = {
      performanceRows: async (_ws, _from, _to, agentId) => {
        calls.push(agentId);
        return [];
      },
    };
    const service = new AgentsService(
      fakeAgentsRepo({ id: AGENT_ID, name: 'Reviewer' }),
      async () => {
        throw new Error('llm must not be called');
      },
      undefined,
      perf,
    );
    await service.stats(WORKSPACE_ID, AGENT_ID, { days: 30 });
    // Called twice: current period, then prior period — both scoped to this agent.
    expect(calls).toEqual([AGENT_ID, AGENT_ID]);
  });
});

describe('AC-1 parity — AgentsService.stats matches CiService.agentPerformance for the same agent/period', () => {
  it('runs/cost/duration/accept_rate are IDENTICAL between the dashboard row and the Stats tab, from the same underlying data', async () => {
    const row = fixtureRow(AGENT_ID);
    const agentRecord: AgentRecord = {
      id: AGENT_ID,
      name: 'Security Reviewer',
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: '',
      strategy: 'auto',
      ciFailOn: 'critical',
    };

    // ---- The dashboard's view (CiService.agentPerformance, all agents) ----
    class FakeCiRepo {
      calls = 0;
      async performanceRows(): Promise<PerfRangeRow[]> {
        this.calls += 1;
        return this.calls === 1 ? [row] : []; // current period has the row; prior period doesn't
      }
      async costByModel() {
        return [];
      }
    }
    class FakeAgentLookup implements AgentLookup {
      async getById(_ws: string, id: string) {
        return id === AGENT_ID ? agentRecord : undefined;
      }
      async list() {
        return [agentRecord];
      }
    }
    const ciService = new CiService(
      new FakeCiRepo() as unknown as CiRepository,
      new FakeAgentLookup(),
      new NoopSkillLookup(),
      new NoopMemoryReader(),
      new NoopRepoLookup(),
      neverCalledGithubClient(),
      '',
      new MockSecretsProvider({}),
    );
    const dashboard = await ciService.agentPerformance(WORKSPACE_ID, { days: 30 });
    const dashboardRow = dashboard.agents.find((a) => a.agent_id === AGENT_ID)!;
    expect(dashboardRow).toBeDefined();

    // ---- The Stats tab's view (AgentsService.stats, one agent) ----
    let statsCalls = 0;
    const perf: PerformanceRowSource = {
      performanceRows: async () => {
        statsCalls += 1;
        return statsCalls === 1 ? [row] : [];
      },
    };
    const agentsService = new AgentsService(
      fakeAgentsRepo({ id: AGENT_ID, name: agentRecord.name }),
      async () => {
        throw new Error('llm must not be called');
      },
      undefined,
      perf,
    );
    const statsTab = await agentsService.stats(WORKSPACE_ID, AGENT_ID, { days: 30 });
    expect(statsTab).toBeDefined();

    // AC-1 — literal field-by-field parity, not just "both non-null".
    expect(statsTab!.runs).toBe(dashboardRow.runs);
    expect(statsTab!.total_cost_usd).toBe(dashboardRow.total_cost_usd);
    expect(statsTab!.avg_cost_usd).toBe(dashboardRow.avg_cost_usd);
    expect(statsTab!.avg_latency_ms).toBe(dashboardRow.avg_latency_ms);
    expect(statsTab!.accept_rate).toBe(dashboardRow.accept_rate);
    expect(statsTab!.low_sample).toBe(dashboardRow.low_sample);
    expect(statsTab!.decisions).toBe(dashboardRow.decisions);

    // Sanity: these aren't both trivially null/zero — the parity is real.
    expect(dashboardRow.runs).toBe(4);
    expect(dashboardRow.avg_cost_usd).toBe(2); // 6 / costedRuns(3)
    expect(dashboardRow.avg_latency_ms).toBe(2000); // 8000 / timedRuns(4)
    expect(dashboardRow.accept_rate).toBeCloseTo(12 / 15);
  });

  it('an empty-source row also stays consistent (AC-4): both surfaces render honest zeros for the same agent+period', async () => {
    const agentRecord: AgentRecord = {
      id: AGENT_ID,
      name: 'Idle Agent',
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: '',
      strategy: 'auto',
      ciFailOn: 'critical',
    };
    class FakeCiRepo {
      async performanceRows(): Promise<PerfRangeRow[]> {
        return [];
      }
      async costByModel() {
        return [];
      }
    }
    class FakeAgentLookup implements AgentLookup {
      async getById(_ws: string, id: string) {
        return id === AGENT_ID ? agentRecord : undefined;
      }
      async list() {
        return [agentRecord];
      }
    }
    const ciService = new CiService(
      new FakeCiRepo() as unknown as CiRepository,
      new FakeAgentLookup(),
      new NoopSkillLookup(),
      new NoopMemoryReader(),
      new NoopRepoLookup(),
      neverCalledGithubClient(),
      '',
      new MockSecretsProvider({}),
    );
    const dashboard = await ciService.agentPerformance(WORKSPACE_ID, { days: 30 });
    const dashboardRow = dashboard.agents.find((a) => a.agent_id === AGENT_ID)!;

    const perf: PerformanceRowSource = { performanceRows: async () => [] };
    const agentsService = new AgentsService(
      fakeAgentsRepo({ id: AGENT_ID, name: agentRecord.name }),
      async () => {
        throw new Error('llm must not be called');
      },
      undefined,
      perf,
    );
    const statsTab = await agentsService.stats(WORKSPACE_ID, AGENT_ID, { days: 30 });

    expect(statsTab!.runs).toBe(dashboardRow.runs);
    expect(statsTab!.runs).toBe(0);
    expect(statsTab!.accept_rate).toBe(dashboardRow.accept_rate);
    expect(statsTab!.accept_rate).toBeNull();
    expect(statsTab!.total_cost_usd).toBe(dashboardRow.total_cost_usd);
    expect(statsTab!.total_cost_usd).toBeNull();
  });
});
