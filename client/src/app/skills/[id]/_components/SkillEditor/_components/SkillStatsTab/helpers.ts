import type { DonutSegment } from "@devdigest/ui";
import type { SkillStats } from "@devdigest/shared";
import { CATEGORY_COLORS, FALLBACK_CATEGORY_COLOR } from "./constants";

/** Map API category rows to Donut segments, largest first. */
export function toCategorySegments(rows: SkillStats["findings_by_category"]): DonutSegment[] {
  return [...rows]
    .sort((a, b) => b.cost_usd - a.cost_usd)
    .map((r) => ({
      label: r.category,
      value: r.cost_usd,
      color: CATEGORY_COLORS[r.category] ?? FALLBACK_CATEGORY_COLOR,
    }));
}

/** Whole-number percentage, or `null` when there is no data yet. */
export function roundPercent(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(value);
}
