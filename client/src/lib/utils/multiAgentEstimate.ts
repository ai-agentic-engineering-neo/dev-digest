/* multiAgentEstimate.ts — pure pre-run cost/time estimate for a set of agents
   about to be fanned out in a multi-agent review. Agents without run history
   (has_history:false) have no reliable estimate yet, so they're skipped rather
   than treated as zero-cost/zero-time. */
import type { Agent } from "@devdigest/shared";

export interface MultiAgentEstimate {
  /** Sum of each historied agent's average cost — agents run in parallel, so
   *  cost (unlike time) accumulates across all of them. */
  total_cost_usd: number;
  /** Max of each historied agent's average duration — agents run in parallel,
   *  so wall-clock time is bounded by the slowest one, not the sum. */
  total_time_ms: number;
}

/** Summarise the pre-run cost/time estimate for a roster of agents. */
export function summariseEstimate(agents: Agent[]): MultiAgentEstimate {
  let total_cost_usd = 0;
  let total_time_ms = 0;

  for (const agent of agents) {
    if (!agent.has_history) continue;
    if (agent.est_cost_usd != null) total_cost_usd += agent.est_cost_usd;
    if (agent.est_duration_ms != null) {
      total_time_ms = Math.max(total_time_ms, agent.est_duration_ms);
    }
  }

  return { total_cost_usd, total_time_ms };
}
