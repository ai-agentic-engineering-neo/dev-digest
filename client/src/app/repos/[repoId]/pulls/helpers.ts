import type { FindingRecord, PrFindingsCounts, ReviewRecord } from "@devdigest/shared";
import { NO_COST, SEVERITY_ORDER, SIZE_MEDIUM_MAX, SIZE_SMALL_MAX, type PrMeta, type SizeInfo } from "./constants";

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

/* Formatting for the run cost badge and the trace drawer's COST tile: one
   definition of "readable cost". */

/**
 * USD cost with at least 3 significant digits of signal:
 * - ≥ $0.01 → 3 decimals ("$0.012", "$1.250"; never "$0.01")
 * - < $0.01 → 2 significant digits ("$0.0013")
 * - exactly 0 (free model) → "$0.000"
 * - null / undefined / non-finite → "—"
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd < 0) return NO_COST;
  if (usd === 0) return "$0.000";
  // Round to 2 significant digits first so 0.00999 lands on the ≥ $0.01 branch.
  const rounded = Number(usd.toPrecision(2));
  if (rounded >= 0.01) return `$${usd.toFixed(3)}`;
  const decimals = 1 - Math.floor(Math.log10(rounded));
  return `$${rounded.toFixed(decimals)}`;
}

/** Compact token count: 800 → "800", 8_200 → "8.2K", 15_000 → "15K", 1_250_000 → "1.3M". */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  const [div, unit] = n < 1_000_000 ? [1000, "K"] : [1_000_000, "M"];
  return `${(n / div).toFixed(1).replace(/\.0$/, "")}${unit}`;
}

/** "8.2K→1.3K" token in→out summary. */
export function formatTokenPair(tokensIn: number, tokensOut: number): string {
  return `${formatTokenCount(tokensIn)}→${formatTokenCount(tokensOut)}`;
}
