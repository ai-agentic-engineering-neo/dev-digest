import type { FindingRecord, ReviewRecord, Severity } from "@devdigest/shared";

/** Fixed display order for the severity badges + popover list. */
export const SEVERITY_ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/**
 * The PR's most recent `kind: "review"` entry (by created_at) — mirrors the
 * "latest review wins" scoping the server already uses for the list's
 * findings_by_severity aggregate, so the popover's contents always match the
 * badge counts.
 */
export function pickLatestReview(reviews: ReviewRecord[] | undefined): ReviewRecord | null {
  if (!reviews) return null;
  let latest: ReviewRecord | null = null;
  for (const r of reviews) {
    if (r.kind !== "review") continue;
    if (!latest || new Date(r.created_at).getTime() > new Date(latest.created_at).getTime()) {
      latest = r;
    }
  }
  return latest;
}

export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}
