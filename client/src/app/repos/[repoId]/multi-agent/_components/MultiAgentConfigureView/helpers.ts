import type { AgentRunEstimate } from "@devdigest/shared/contracts/observability";

/**
 * AC-6 — aggregate estimate over the currently-selected agents: MAX of
 * durations (wall-clock under concurrency, matching how the server derives
 * `total_duration_ms`), SUM of costs. An agent with no completed run (either
 * field null) contributes nothing to the aggregate rather than poisoning it
 * with a fabricated 0 — its own per-agent row already says "no estimate
 * available" (AC-5). `durationMs`/`costUsd` are null only when NONE of the
 * selected agents have any estimate at all.
 */
export function aggregateEstimate(
  selectedAgentIds: string[],
  estimates: AgentRunEstimate[],
): { durationMs: number | null; costUsd: number | null } {
  const byId = new Map(estimates.map((e) => [e.agent_id, e]));
  const selected = selectedAgentIds.map((id) => byId.get(id)).filter((e): e is AgentRunEstimate => !!e);
  const durations = selected.map((e) => e.avg_duration_ms).filter((d): d is number => d != null);
  const costs = selected.map((e) => e.avg_cost_usd).filter((c): c is number => c != null);
  return {
    durationMs: durations.length ? Math.max(...durations) : null,
    costUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
  };
}
