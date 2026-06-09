import type { AgentStats } from '@devdigest/shared/contracts/observability';
import type { RunsRepository, AgentRunRow } from './repository.js';
import { NotFoundError } from '../../platform/errors.js';
import { TREND_WINDOW } from './constants.js';
import { average, averageRounded } from './helpers.js';

/**
 * A5 — per-agent stats (extracted from RunsService; behaviour identical).
 * Plain functions taking the loaded repo + ids / rows as params.
 */

type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

/** Compute the full per-agent stats DTO (GET /agents/:id/stats). */
export async function agentStats(
  repo: RunsRepository,
  workspaceId: string,
  agentId: string,
): Promise<AgentStats> {
  const agent = await repo.getAgent(workspaceId, agentId);
  if (!agent) throw new NotFoundError('Agent not found');

  const runs = await repo.agentRunsForAgent(workspaceId, agentId);
  const findings = await repo.findingsForAgent(workspaceId, agentId);

  const accepted = findings.filter((f) => f.acceptedAt != null).length;
  const dismissed = findings.filter((f) => f.dismissedAt != null).length;
  const pending = findings.length - accepted - dismissed;
  const acted = accepted + dismissed;

  const bySeverity = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL' || f.severity === 'WARNING' || f.severity === 'SUGGESTION') {
      bySeverity[f.severity as Severity] += 1;
    }
  }

  const doneRuns = runs.filter((r) => r.status === 'done');
  const costs = doneRuns.map((r) => r.costUsd).filter((c): c is number => c != null);
  const totalCost = costs.length > 0 ? costs.reduce((n, c) => n + c, 0) : null;
  const latencies = doneRuns.map((r) => r.durationMs).filter((d): d is number => d != null);
  const avgLatency = averageRounded(latencies);

  const findingsCounts = doneRuns
    .map((r) => r.findingsCount)
    .filter((c): c is number => c != null);
  const avgFindings = average(findingsCounts);

  return {
    agent_id: agentId,
    agent_name: agent.name,
    runs: runs.length,
    findings_total: findings.length,
    accepted,
    dismissed,
    pending,
    accept_rate: acted > 0 ? accepted / acted : null,
    dismiss_rate: acted > 0 ? dismissed / acted : null,
    avg_findings_per_run: avgFindings,
    total_cost_usd: totalCost,
    avg_cost_usd: costs.length > 0 ? (totalCost ?? 0) / costs.length : null,
    avg_latency_ms: avgLatency,
    findings_by_severity: bySeverity,
    trend: buildTrend(runs),
  };
}

/** A small accept-rate-friendly trend: findings per run over the last 12 runs. */
export function buildTrend(runs: AgentRunRow[]): { label: string; value: number }[] {
  return runs
    .slice(-TREND_WINDOW)
    .map((r, i) => ({ label: `run ${i + 1}`, value: r.findingsCount ?? 0 }));
}
