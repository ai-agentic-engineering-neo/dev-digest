import type { CiRun } from "@devdigest/shared/contracts/eval-ci";
import type { CiRunsFilterState } from "./constants";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function withinDateRange(run: CiRun, range: CiRunsFilterState["dateRange"]): boolean {
  if (range === "all") return true;
  if (!run.ran_at) return true; // no timestamp yet (e.g. still running) — never hide it
  return Date.now() - Date.parse(run.ran_at) <= SEVEN_DAYS_MS;
}

/** AC-28 — the five filters compose (AND, not OR). */
export function applyFilters(runs: CiRun[], f: CiRunsFilterState): CiRun[] {
  return runs.filter(
    (r) =>
      withinDateRange(r, f.dateRange) &&
      (f.agentName === "" || r.agent_name === f.agentName) &&
      (f.repo === "" || r.repo === f.repo) &&
      (f.status === "" || r.status === f.status) &&
      (f.source === "" || r.source === f.source),
  );
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

// AC-28 — agent/repo vocabularies now come from the server's `CiRunsPage`
// (`.agents`/`.repos`, computed from the same read as the runs themselves —
// see `CiRunsView.tsx`), not derived client-side from `runs` any more.
// `source` has no server-provided vocabulary in `CiRunsPage`, so it's still
// derived here.
export function uniqueSources(runs: CiRun[]): string[] {
  return uniqueSorted(runs.map((r) => r.source));
}

/** AC-28 — "each chip's count equals what clicking it yields": count against
 *  every filter EXCEPT the one the chip belongs to, so selecting it changes
 *  the list to exactly that count, never a stale pre-filter count. */
export function countByStatus(runs: CiRun[], f: CiRunsFilterState): Record<string, number> {
  const scoped = applyFilters(runs, { ...f, status: "" });
  const out: Record<string, number> = {};
  for (const r of scoped) {
    if (!r.status) continue;
    out[r.status] = (out[r.status] ?? 0) + 1;
  }
  return out;
}

export function countBySource(runs: CiRun[], f: CiRunsFilterState): Record<string, number> {
  const scoped = applyFilters(runs, { ...f, source: "" });
  const out: Record<string, number> = {};
  for (const r of scoped) {
    if (!r.source) continue;
    out[r.source] = (out[r.source] ?? 0) + 1;
  }
  return out;
}

/** AC-32 — the studio path when the PR is imported, else the provider URL;
 *  resolved server-side onto `pr_url` (falls back to `github_url` when the
 *  run predates that resolution or the PR was never imported). */
export function prLinkFor(run: CiRun): string | null {
  return run.pr_url ?? run.github_url ?? null;
}
