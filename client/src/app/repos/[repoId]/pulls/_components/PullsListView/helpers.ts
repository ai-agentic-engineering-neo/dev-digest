import type { PrMeta } from "@devdigest/shared";
import { OPEN_STATUSES } from "./constants";

export type PullsSort = "newest" | "oldest" | string;

/** Status filter ("all" = no filter) + title/number search + updated-at sort. */
export function filterPulls(
  pulls: readonly PrMeta[],
  opts: { status: string; query: string; sort: PullsSort },
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

/** Header counters: open PRs and the ones still waiting for a review. */
export function countPulls(pulls: readonly PrMeta[]): { open: number; needsReview: number } {
  return {
    open: pulls.filter((p) => OPEN_STATUSES.has(p.status)).length,
    needsReview: pulls.filter((p) => p.status === "needs_review").length,
  };
}
