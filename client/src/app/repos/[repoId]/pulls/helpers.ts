import {
  OPEN_STATUSES,
  SIZE_MEDIUM_MAX,
  SIZE_SMALL_MAX,
  type PrMeta,
  type SizeInfo,
} from "./constants";

/** Sort direction accepted by the list. Anything else sorts newest-first. */
export type SortKey = "newest" | "oldest";

/**
 * The PR list's visible set: status filter, then free-text query over title and
 * number, then sort by updated_at. Pure — no React, no hooks — so the list's
 * behaviour is unit-testable without rendering the screen.
 */
export function visiblePulls(
  pulls: PrMeta[],
  opts: { status: string; query: string; sort: SortKey | string },
): PrMeta[] {
  const q = opts.query.trim().toLowerCase();
  return pulls
    .filter((p) => opts.status === "all" || p.status === opts.status)
    .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
    .slice()
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at ?? "") || 0;
      const tb = Date.parse(b.updated_at ?? "") || 0;
      return opts.sort === "oldest" ? ta - tb : tb - ta;
    });
}

/**
 * Header counts. Deliberately computed from the RAW list, not the filtered one:
 * the summary line describes the repository, not the current filter.
 */
export function pullCounts(pulls: PrMeta[]): { open: number; needsReview: number } {
  let open = 0;
  let needsReview = 0;
  for (const p of pulls) {
    if (OPEN_STATUSES.has(p.status)) open++;
    if (p.status === "needs_review") needsReview++;
  }
  return { open, needsReview };
}

/** Bucket a PR into S/M/L by total changed lines. */
export function sizeOf(pr: PrMeta): SizeInfo {
  const lines = pr.additions + pr.deletions;
  const size = lines < SIZE_SMALL_MAX ? "S" : lines < SIZE_MEDIUM_MAX ? "M" : "L";
  return { size, lines };
}

// `relativeTime` moved to `@/lib/format` — a third real consumer
// (`PrBriefCard`'s provenance line) arrived, so it's promoted per
// `client/LEARNINGS.md`'s "colocate, promote on the second/third use".
export { relativeTime } from "@/lib/format";
