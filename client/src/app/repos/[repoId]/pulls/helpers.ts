import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import {
  FINDINGS_SEVERITIES,
  SIZE_MEDIUM_MAX,
  SIZE_SMALL_MAX,
  type PrMeta,
  type SizeInfo,
} from "./constants";

/**
 * Findings from each agent's latest review, sorted by severity — the same
 * rule the API applies to the list's `findings_counts`, so the hover preview
 * always matches the chips.
 */
export function latestFindingsPerAgent(reviews: ReviewRecord[]): FindingRecord[] {
  const newestFirst = [...reviews]
    .filter((rv) => rv.kind === "review")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const seenAgents = new Set<string>();
  const findings: FindingRecord[] = [];
  for (const rv of newestFirst) {
    const agentKey = rv.agent_id ?? "none";
    if (seenAgents.has(agentKey)) continue;
    seenAgents.add(agentKey);
    findings.push(...rv.findings);
  }
  const rank = (sev: string) => {
    const i = FINDINGS_SEVERITIES.indexOf(sev as (typeof FINDINGS_SEVERITIES)[number]);
    return i === -1 ? FINDINGS_SEVERITIES.length : i;
  };
  return findings.sort((a, b) => rank(a.severity) - rank(b.severity));
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
