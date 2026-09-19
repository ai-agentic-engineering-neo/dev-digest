import type { FindingRecord, ReviewRecord, Severity } from "@devdigest/shared";
import { FINDINGS_SEVERITIES, SIZE_MEDIUM_MAX, SIZE_SMALL_MAX, type PrMeta, type SizeInfo } from "./constants";

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

/**
 * The FINDINGS column's chip list: [severity, count] pairs in
 * CRITICAL → WARNING → SUGGESTION order, skipping severities absent from
 * `pr.findings_counts` (server already omits zero-count severities — see
 * `findingsCountsByPr` — this just orders + narrows the type).
 */
export function presentFindingsSeverities(pr: PrMeta): [Severity, number][] {
  const counts = pr.findings_counts;
  if (!counts) return [];
  return FINDINGS_SEVERITIES.filter((sev) => counts[sev] != null).map(
    (sev) => [sev, counts[sev]!] as [Severity, number],
  );
}

/**
 * Findings from each agent's LATEST review only — the same "latest wins"
 * rule the server's findings_counts uses, applied client-side to the
 * already-fetched review list so the hover preview's finding cards always
 * match the FINDINGS column's pill counts. Reviews must arrive newest-first
 * (as `/pulls/:id/reviews` returns them); summary-kind reviews are ignored.
 */
export function latestFindingsPerAgent(reviews: ReviewRecord[]): FindingRecord[] {
  const seenGroup = new Set<string>();
  const out: FindingRecord[] = [];
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    const groupKey = r.agent_id ?? r.id;
    if (seenGroup.has(groupKey)) continue;
    seenGroup.add(groupKey);
    out.push(...r.findings);
  }
  return out;
}
