/** AC-26…AC-31 — the CI Runs page's own filter state. Kept as a plain union
 *  (not derived from the vendored `CiRunStatus`) so an unrecognised/legacy
 *  status string still renders instead of narrowing the filter type. */
export type CiRunDateRange = "last7" | "all";

export interface CiRunsFilterState {
  dateRange: CiRunDateRange;
  agentName: string; // "" = all agents
  repo: string; // "" = all repos
  status: string; // "" = all statuses
  source: string; // "" = all sources
}

/** AC-4 parity for reads: default view is the recent window, not "all time". */
export const DEFAULT_FILTERS: CiRunsFilterState = {
  dateRange: "last7",
  agentName: "",
  repo: "",
  status: "",
  source: "",
};

/** AC-29 — re-query the stored list + trigger a debounced provider refresh
 *  at most this often while the page is visible. */
export const AUTO_REFRESH_MS = 30_000;

/** Every `CiRunStatus` value, in table/legend order. */
export const STATUS_ORDER = ["succeeded", "no_findings", "failed", "running"] as const;

export function statusLabelKey(status: string): string {
  return status === "no_findings" ? "noFindings" : status;
}
