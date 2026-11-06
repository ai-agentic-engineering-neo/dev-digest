import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";

export interface ResolvedPr {
  id: string;
  number: number;
  title: string;
}

/** colorIndex is 1..6 (--viz-N). */
export interface SelectedAgent {
  id: string;
  name: string;
  model: string;
  colorIndex: number;
}

export type StartState =
  | { status: "pending" }
  | { status: "started"; run_id: string }
  /** `error: null` = no run was started (UI shows `runs.column.noRunStarted`). */
  | { status: "failed"; error: string | null };

/** Key = agent id. */
export type StartStates = Readonly<Record<string, StartState>>;

export type ColumnState =
  | { kind: "starting" }
  | { kind: "failed_to_start"; error: string | null }
  | { kind: "running"; run: RunSummary }
  | { kind: "done"; run: RunSummary; review: ReviewRecord }
  | { kind: "failed"; run: RunSummary }
  | { kind: "cancelled"; run: RunSummary };

/** findings are sorted; [] unless the column is done. */
export interface AgentColumnView {
  agent: SelectedAgent;
  state: ColumnState;
  findings: FindingRecord[];
}

export interface RunTotals {
  agent_count: number;
  wall_ms: number | null;
  cost_usd: number | null;
}

export interface EstimateTotal {
  duration_ms: number;
  cost_usd: number | null;
}
