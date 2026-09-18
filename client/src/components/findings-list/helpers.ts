import type { FindingRecord, ReviewRecord, SeverityCounts } from "@devdigest/shared";
import { SEVERITY_SORT_WEIGHT } from "./constants";

/**
 * Tally findings per severity, client-side.
 *
 * The PR list gets this precomputed on `PrMeta.findings`; the Timeline derives
 * it here from the reviews it already holds, so no server field is needed for
 * per-run counts. Pass findings that are already filtered (see `panelFindings`).
 */
export function tallySeverities(findings: FindingRecord[]): SeverityCounts {
  const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity === "CRITICAL") counts.CRITICAL += 1;
    else if (f.severity === "WARNING") counts.WARNING += 1;
    else if (f.severity === "SUGGESTION") counts.SUGGESTION += 1;
  }
  return counts;
}

/**
 * Severity-sorted copy, dismissed findings removed.
 *
 * Dismissed rows are dropped because the counts that open this panel exclude
 * them too (`PrMeta.findings`) — showing a row the badge didn't count would
 * make the heading disagree with the list.
 *
 * Deliberately not `FindingsPanel/helpers.ts#visibleFindings`: that one is
 * colocated to the PR-detail route and also applies a confidence filter, which
 * would hide findings this panel has already counted.
 */
export function panelFindings(findings: FindingRecord[]): FindingRecord[] {
  return findings
    .filter((f) => !f.dismissed_at)
    .sort(
      (a, b) =>
        (SEVERITY_SORT_WEIGHT[a.severity] ?? 9) - (SEVERITY_SORT_WEIGHT[b.severity] ?? 9),
    );
}

/**
 * Findings from **each agent's latest review**, matching what the PR list's
 * counts describe (`PrMeta.findings`, computed the same way server-side).
 *
 * `reviews` must be newest-first, as `GET /pulls/:id/reviews` returns it, so
 * the first row seen per agent is that agent's latest. Taking `reviews[0]`
 * instead would list only whichever agent finished last — the exact bug that
 * made a PR with five outstanding findings show an empty popover.
 */
export function latestPerAgentFindings(reviews: ReviewRecord[]): FindingRecord[] {
  const seen = new Set<string>();
  const out: FindingRecord[] = [];
  for (const review of reviews) {
    if (review.kind !== "review") continue;
    const key = review.agent_id ?? "__no_agent__";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(...review.findings);
  }
  return out;
}

/** `src/api/users.ts:45-52`, collapsing a single-line range to `:45`. */
export function formatLocation(f: Pick<FindingRecord, "file" | "start_line" | "end_line">): string {
  const range = f.end_line !== f.start_line ? `-${f.end_line}` : "";
  return `${f.file}:${f.start_line}${range}`;
}
