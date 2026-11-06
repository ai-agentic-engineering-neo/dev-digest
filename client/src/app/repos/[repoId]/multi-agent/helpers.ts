import type { Agent, FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import type { AgentRunEstimate } from "@/lib/types";
import { AGENT_COLOR_COUNT, MAX_AGENTS_PER_RUN, SCORE_OK, SCORE_WARN, SEVERITY_RANK } from "./constants";
import type {
  AgentColumnView,
  ColumnState,
  EstimateTotal,
  RunTotals,
  SelectedAgent,
  StartStates,
} from "./types";

const FINISHED_STATUSES: readonly string[] = ["done", "failed", "cancelled"];

/** Stable 1..6 color slot: position in the sorted id list, so it ignores list order. */
export function agentColorIndex(agentId: string, agentIds: readonly string[]): number {
  const index = [...agentIds].sort().indexOf(agentId);
  return index < 0 ? 1 : (index % AGENT_COLOR_COUNT) + 1;
}

export function defaultSelection(agents: readonly Agent[]): string[] {
  return agents
    .filter((a) => a.enabled)
    .slice(0, MAX_AGENTS_PER_RUN)
    .map((a) => a.id);
}

export function toSelectedAgents(agents: readonly Agent[], ids: readonly string[] | null): SelectedAgent[] {
  const wanted = new Set(ids ?? defaultSelection(agents));
  const allIds = agents.map((a) => a.id);
  return agents
    .filter((a) => wanted.has(a.id))
    .slice(0, MAX_AGENTS_PER_RUN)
    .map((a) => ({ id: a.id, name: a.name, model: a.model, colorIndex: agentColorIndex(a.id, allIds) }));
}

function ranAtMs(run: RunSummary): number {
  if (run.ran_at === null) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(run.ran_at);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

export function latestRunPerAgent(runs: readonly RunSummary[]): Map<string, RunSummary> {
  const latest = new Map<string, RunSummary>();
  for (const run of runs) {
    if (run.agent_id === null) continue;
    const current = latest.get(run.agent_id);
    if (current === undefined || ranAtMs(run) > ranAtMs(current)) latest.set(run.agent_id, run);
  }
  return latest;
}

export function sortFindings(findings: readonly FindingRecord[]): FindingRecord[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
      a.start_line - b.start_line,
  );
}

function stateForRun(run: RunSummary, reviews: readonly ReviewRecord[]): ColumnState {
  switch (run.status) {
    case "done": {
      const review = reviews.find((r) => r.run_id === run.run_id);
      // The executor writes the review before marking the run done: no review yet = cache not refreshed.
      return review ? { kind: "done", run, review } : { kind: "running", run };
    }
    case "failed":
      return { kind: "failed", run };
    case "cancelled":
      return { kind: "cancelled", run };
    default:
      return { kind: "running", run };
  }
}

export function buildColumns(
  agents: readonly SelectedAgent[],
  runs: readonly RunSummary[],
  reviews: readonly ReviewRecord[],
  startStates: StartStates,
): AgentColumnView[] {
  const latest = latestRunPerAgent(runs);
  return agents.map((agent) => {
    const start = startStates[agent.id];
    let state: ColumnState;
    if (start?.status === "pending") {
      state = { kind: "starting" };
    } else if (start?.status === "failed") {
      state = { kind: "failed_to_start", error: start.error };
    } else {
      const run =
        start?.status === "started" ? runs.find((r) => r.run_id === start.run_id) : latest.get(agent.id);
      state = run ? stateForRun(run, reviews) : { kind: "starting" };
    }
    const findings = state.kind === "done" ? sortFindings(state.review.findings) : [];
    return { agent, state, findings };
  });
}

function columnRun(column: AgentColumnView): RunSummary | null {
  return column.state.kind === "starting" || column.state.kind === "failed_to_start" ? null : column.state.run;
}

export function runTotals(columns: readonly AgentColumnView[]): RunTotals {
  let wall: number | null = null;
  let cost: number | null = null;
  for (const column of columns) {
    const run = columnRun(column);
    if (!run) continue;
    if (run.status !== null && FINISHED_STATUSES.includes(run.status) && run.duration_ms !== null) {
      wall = wall === null ? run.duration_ms : Math.max(wall, run.duration_ms);
    }
    if (run.cost_usd !== null) cost = (cost ?? 0) + run.cost_usd;
  }
  return { agent_count: columns.length, wall_ms: wall, cost_usd: cost };
}

export function aggregateEstimate(
  selectedIds: readonly string[],
  estimates: readonly AgentRunEstimate[],
): EstimateTotal | null {
  const selected = new Set(selectedIds);
  const relevant = estimates.filter((e) => selected.has(e.agent_id));
  if (relevant.length === 0) return null;
  let cost: number | null = null;
  for (const e of relevant) {
    if (e.avg_cost_usd !== null) cost = (cost ?? 0) + e.avg_cost_usd;
  }
  return { duration_ms: Math.max(...relevant.map((e) => e.avg_duration_ms)), cost_usd: cost };
}

export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export function scoreTone(score: number): "ok" | "warn" | "crit" {
  if (score >= SCORE_OK) return "ok";
  if (score >= SCORE_WARN) return "warn";
  return "crit";
}

/** Findings a column shows: all of them, or only those in the conflict set when "Show only conflicts" is on. */
export function visibleFindings(
  column: AgentColumnView,
  onlyFindingIds: ReadonlySet<string> | null,
): FindingRecord[] {
  return onlyFindingIds ? column.findings.filter((f) => onlyFindingIds.has(f.id)) : column.findings;
}
