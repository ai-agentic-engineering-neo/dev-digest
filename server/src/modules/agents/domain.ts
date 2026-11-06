/** Pure domain types + rules for the agents module (no runtime imports). */

/** One finished run's timing/cost, as read for run estimates (newest N per agent). */
export interface RunEstimateSample {
  agentId: string;
  durationMs: number;
  costUsd: number | null;
}

/** Average duration/cost of an agent's most recent done runs. */
export interface AgentRunEstimate {
  agent_id: string;
  sample_size: number;
  avg_duration_ms: number;
  avg_cost_usd: number | null;
}

export interface AgentRunEstimates {
  estimates: AgentRunEstimate[];
}

/**
 * Group samples by agent. avg duration is rounded; avg cost averages only the
 * non-null costs (null when all are null). Sorted by agent_id ascending.
 */
export function aggregateRunEstimates(samples: readonly RunEstimateSample[]): AgentRunEstimate[] {
  const byAgent = new Map<string, RunEstimateSample[]>();
  for (const s of samples) {
    const list = byAgent.get(s.agentId);
    if (list) list.push(s);
    else byAgent.set(s.agentId, [s]);
  }
  const out: AgentRunEstimate[] = [];
  for (const [agentId, list] of byAgent) {
    const totalMs = list.reduce((sum, s) => sum + s.durationMs, 0);
    const costs = list.flatMap((s) => (s.costUsd === null ? [] : [s.costUsd]));
    out.push({
      agent_id: agentId,
      sample_size: list.length,
      avg_duration_ms: Math.round(totalMs / list.length),
      avg_cost_usd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0) / costs.length,
    });
  }
  return out.sort((a, b) => (a.agent_id < b.agent_id ? -1 : a.agent_id > b.agent_id ? 1 : 0));
}
