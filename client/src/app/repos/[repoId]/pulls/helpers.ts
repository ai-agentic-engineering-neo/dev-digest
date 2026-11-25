import type { FindingRecord } from "@devdigest/shared";
import {
  ALL_STATUSES,
  OPEN_STATUSES,
  SIZE_MEDIUM_MAX,
  SIZE_SMALL_MAX,
  type PrMeta,
  type PullsSort,
  type SizeInfo,
} from "./constants";

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
 * Colour for the STATUS badge + row icon. A "reviewed" PR is only green when
 * no open finding is left: open CRITICAL → crit, open WARNING → warn. Other
 * statuses keep their STATUS_META colour.
 */
export function statusColor(pr: PrMeta, base: string): string {
  if (pr.status !== "reviewed" || !pr.findings) return base;
  if (pr.findings.critical > 0) return "var(--crit)";
  if (pr.findings.warning > 0) return "var(--warn)";
  return base;
}

/** A finding's location: "file:12", or "file:12–18" for a range. */
export function formatFindingLocation(
  f: Pick<FindingRecord, "file" | "start_line" | "end_line">,
): string {
  return f.end_line && f.end_line !== f.start_line
    ? `${f.file}:${f.start_line}–${f.end_line}`
    : `${f.file}:${f.start_line}`;
}

/**
 * The PR list as shown: filtered by status (unless "all") and by a free-text
 * query over title / PR number, then sorted by last update.
 */
export function filterPulls(
  pulls: PrMeta[],
  { status, query, sort }: { status: string; query: string; sort: string },
): PrMeta[] {
  const q = query.trim().toLowerCase();
  const order: PullsSort = sort === "oldest" ? "oldest" : "newest";
  return pulls
    .filter((p) => status === ALL_STATUSES || p.status === status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? "") || 0;
      const tb = Date.parse(b.updated_at ?? "") || 0;
      return order === "oldest" ? ta - tb : tb - ta;
    });
}

/** Header summary counts: open PRs, and how many of those still need review. */
export function countPulls(pulls: PrMeta[]): { open: number; needsReview: number } {
  return {
    open: pulls.filter((p) => OPEN_STATUSES.has(p.status)).length,
    needsReview: pulls.filter((p) => p.status === "needs_review").length,
  };
}
