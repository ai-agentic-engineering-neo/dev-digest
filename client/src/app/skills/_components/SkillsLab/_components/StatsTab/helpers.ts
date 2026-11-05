import type { DonutSegment } from "@devdigest/ui";
import type { SkillStats } from "@/lib/types";
import { CATEGORY_COLOR, OTHER_CATEGORY_COLOR } from "./constants";

export function categorySegments(byCategory: SkillStats["by_category"]): DonutSegment[] {
  return byCategory.map((c) => ({
    label: c.category,
    value: c.count,
    color: CATEGORY_COLOR[c.category] ?? OTHER_CATEGORY_COLOR,
  }));
}

/** Rate 0..1 → whole percent, null → null. */
export function toPercent(rate: number | null): number | null {
  return rate == null ? null : Math.round(rate * 100);
}
