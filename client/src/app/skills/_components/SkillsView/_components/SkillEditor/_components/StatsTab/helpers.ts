import type { SkillStats } from "@devdigest/shared";

/** Em dash for an unmeasured value. `specs/01` established this for cost. */
export const DASH = "—";

/**
 * `null` means UNMEASURED and renders "—"; `0` is a measured zero and renders
 * "0". A fresh workspace with no runs must not look like a failing one, and a
 * skill whose findings were all dismissed must not look unused.
 */
export function metricValue(n: number | null | undefined): string {
  return n == null ? DASH : String(n);
}

/** Same rule, with a percent sign once there is something to measure. */
export function percentValue(pct: number | null | undefined): string {
  return pct == null ? DASH : `${Math.round(pct)}%`;
}

/** Palette for the by-category ring. Deterministic per index, no hashing. */
export const CATEGORY_COLORS = [
  "var(--crit)",
  "var(--warn)",
  "var(--info)",
  "var(--sugg)",
  "var(--accent)",
  "var(--ok)",
] as const;

export interface CategorySegment {
  category: string;
  count: number;
  color: string;
  /** Fraction of the total, 0–1. */
  fraction: number;
}

/**
 * Segments for the findings ring. Values stay COUNTS — the mockup's
 * "security $52.00" is a count run through a money formatter, and `formatCost`
 * must never be called here.
 */
export function categorySegments(byCategory: SkillStats["by_category"]): CategorySegment[] {
  const total = byCategory.reduce((sum, c) => sum + c.count, 0);
  return byCategory.map((c, i) => ({
    category: c.category,
    count: c.count,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? "var(--accent)",
    fraction: total > 0 ? c.count / total : 0,
  }));
}
