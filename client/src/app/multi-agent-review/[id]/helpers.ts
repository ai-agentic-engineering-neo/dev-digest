import type {
  AgentColumn,
  FindingCategory,
  FindingKind,
  FindingRecord,
  ReviewRecord,
  RunSummary,
} from "@devdigest/shared";
import type { ActiveRun } from "@/lib/hooks/reviews";
import type { LiveAgentStatus } from "../_components/AgentSummary";
import type { EnrichedAgentColumn } from "../_components/types";

/** Live status precedence: the authoritative run-history row (`usePrRuns`)
    wins, then the active-runs poll, then the MultiAgentRun resource's own
    snapshot at fetch time. `cancelled` folds into `failed` — this view has no
    separate cancelled affordance. Matches the accepted "degrade to polling"
    behaviour for SSE loss (edge cases). */
export function resolveColumnStatus(
  column: Pick<AgentColumn, "run_id" | "status">,
  runSummaries: RunSummary[] | undefined,
  activeRuns: ActiveRun[] | undefined,
): LiveAgentStatus {
  const summary = runSummaries?.find((r) => r.run_id === column.run_id);
  if (summary?.status === "done") return "done";
  if (summary?.status === "failed" || summary?.status === "cancelled") return "failed";
  if (summary?.status === "running") return "running";
  if (activeRuns?.some((r) => r.run_id === column.run_id)) return "running";
  return column.status;
}

/** Build a findingId → FindingRecord lookup across every review of the PR
    (each ReviewRecord.findings is already the full persisted shape). */
export function buildFindingLookup(reviews: ReviewRecord[] | undefined): Map<string, FindingRecord> {
  const map = new Map<string, FindingRecord>();
  for (const review of reviews ?? []) {
    for (const f of review.findings) map.set(f.id, f);
  }
  return map;
}

/**
 * AgentColumn.findings only carries `AgentColumnFinding` (no
 * confidence/rationale/suggestion/end_line — see contracts gap). Enrich each
 * one to a full FindingRecord from the PR's persisted reviews (AC-17); if a
 * finding isn't found there yet (e.g. reviews haven't refetched since the
 * run just completed), fall back to a minimal record built from the column
 * data so the card still renders instead of crashing.
 */
export function enrichColumns(
  columns: AgentColumn[],
  lookup: Map<string, FindingRecord>,
  fallbackRationale: string,
): EnrichedAgentColumn[] {
  return columns.map((col) => ({
    ...col,
    findings: col.findings.map((acf) => {
      const found = lookup.get(acf.id);
      if (found) return found;
      return {
        id: acf.id,
        severity: acf.severity,
        category: acf.category as FindingCategory,
        title: acf.title,
        file: acf.file,
        start_line: acf.start_line,
        end_line: acf.start_line,
        rationale: fallbackRationale,
        suggestion: null,
        confidence: 0,
        kind: acf.kind as FindingKind | null | undefined,
        review_id: col.run_id,
        accepted_at: null,
        dismissed_at: null,
      } satisfies FindingRecord;
    }),
  }));
}
