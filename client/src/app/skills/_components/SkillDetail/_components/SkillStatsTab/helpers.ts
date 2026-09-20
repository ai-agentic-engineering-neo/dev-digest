import type { SkillStats } from "@devdigest/shared";
import { MAX_SEGMENTS, OTHER_COLOR, OTHER_KEY, SEGMENT_COLORS } from "./constants";

/** Fraction 0..1 -> integer percent string; null -> null (caller renders the dash). */
export function formatPercent(rate: number | null): string | null {
  return rate === null ? null : String(Math.round(rate * 100));
}

export interface Segment {
  /** Category name, or OTHER_KEY for the bucket. */
  category: string;
  count: number;
  color: string;
  isOther: boolean;
  /** Start/end angle in radians, clockwise from 12 o'clock. */
  start: number;
  end: number;
}

/** Sort by count desc (name asc tie-break), keep MAX_SEGMENTS, bucket the rest as "other". */
export function buildSegments(byCategory: SkillStats["by_category"]): Segment[] {
  const sorted = byCategory
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  const head = sorted.slice(0, MAX_SEGMENTS);
  const restCount = sorted.slice(MAX_SEGMENTS).reduce((n, c) => n + c.count, 0);
  const items: Omit<Segment, "start" | "end">[] = head.map((c, i) => ({ category: c.category, count: c.count, color: SEGMENT_COLORS[i]!, isOther: false }));
  if (restCount > 0) items.push({ category: OTHER_KEY, count: restCount, color: OTHER_COLOR, isOther: true });
  const total = items.reduce((n, c) => n + c.count, 0);
  let angle = 0;
  return items.map((it) => {
    const start = angle;
    angle += (it.count / total) * 2 * Math.PI;
    return { ...it, start, end: angle };
  });
}

const MAX_SWEEP = 2 * Math.PI - 0.0001;

/** SVG path for a donut ring segment between two angles (clockwise from 12 o'clock). */
export function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number): string {
  const end2 = Math.min(end, start + MAX_SWEEP);
  const pt = (r: number, a: number) => `${(cx + r * Math.sin(a)).toFixed(3)} ${(cy - r * Math.cos(a)).toFixed(3)}`;
  const large = end2 - start > Math.PI ? 1 : 0;
  return [
    `M ${pt(rOuter, start)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${pt(rOuter, end2)}`,
    `L ${pt(rInner, end2)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${pt(rInner, start)}`,
    "Z",
  ].join(" ");
}
