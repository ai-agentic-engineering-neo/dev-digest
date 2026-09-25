import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "@/components/findings-hover";
import { SIZE_MEDIUM_MAX, SIZE_SMALL_MAX, type PrMeta, type SizeInfo } from "./constants";

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

/** Short date for the LAST REVIEW column ("Sep 24"; the year only when it isn't this year). */
export function shortDate(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * Findings behind the FINDINGS counters: those of every review the server
 * summed (each agent's newest, `latest_review_ids`), most severe first.
 * Falls back to `latest_review_id` for a list row without the id list.
 */
export function currentReviewFindings(reviews: readonly ReviewRecord[], pr: PrMeta): FindingRecord[] {
  const ids = new Set(pr.latest_review_ids ?? (pr.latest_review_id ? [pr.latest_review_id] : []));
  return reviews
    .filter((r) => ids.has(r.id))
    .flatMap((r) => r.findings)
    .sort((a, b) => SEVERITY_LEVELS.indexOf(a.severity) - SEVERITY_LEVELS.indexOf(b.severity));
}
