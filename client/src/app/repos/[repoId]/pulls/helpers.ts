import type { FindingRecord, PrFindingsCounts, ReviewRecord } from "@devdigest/shared";
import { SEVERITY_ORDER, SIZE_MEDIUM_MAX, SIZE_SMALL_MAX, type PrMeta, type SizeInfo } from "./constants";

/** One line of the FINDINGS preview: a finding and the agent that reported it. */
export interface PreviewFinding {
  finding: FindingRecord;
  agentName: string | null;
}

/**
 * The findings behind the list's FINDINGS column: each agent's latest review,
 * most severe first. This is the rule the API applies to
 * `PrMeta.findings_counts`, so the preview lists exactly what the chips count.
 */
export function latestFindingsPerAgent(reviews: ReviewRecord[]): PreviewFinding[] {
  const newestFirst = reviews
    .filter((rv) => rv.kind === "review")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const seenAgents = new Set<string>();
  const shown: PreviewFinding[] = [];
  for (const rv of newestFirst) {
    const agentKey = rv.agent_id ?? "none";
    if (seenAgents.has(agentKey)) continue;
    seenAgents.add(agentKey);
    for (const finding of rv.findings) shown.push({ finding, agentName: rv.agent_name ?? null });
  }
  return shown.sort(
    (a, b) => (SEVERITY_ORDER[a.finding.severity] ?? 9) - (SEVERITY_ORDER[b.finding.severity] ?? 9),
  );
}

/** Total of the FINDINGS column's three levels; 0 for a PR without a review. */
export function totalFindings(counts: PrFindingsCounts | null | undefined): number {
  return counts ? counts.CRITICAL + counts.WARNING + counts.SUGGESTION : 0;
}

/** Bucket a PR into S/M/L by total changed lines. */
export function sizeOf(pr: PrMeta): SizeInfo {
  const lines = pr.additions + pr.deletions;
  const size = lines < SIZE_SMALL_MAX ? "S" : lines < SIZE_MEDIUM_MAX ? "M" : "L";
  return { size, lines };
}

/** Compact relative time for the list's UPDATED column (e.g. "3h", "2d"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
