import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/**
 * The findings behind the list's counts: open (non-dismissed) findings of the
 * reviews the server rolled up (latest review per agent), most severe first,
 * then by confidence.
 */
export function popoverFindings(
  reviews: ReviewRecord[] | undefined,
  reviewIds: string[] | null | undefined,
): FindingRecord[] {
  if (!reviews || !reviewIds) return [];
  const ids = new Set(reviewIds);
  return reviews
    .filter((r) => ids.has(r.id))
    .flatMap((r) => r.findings)
    .filter((f) => !f.dismissed_at)
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || b.confidence - a.confidence,
    );
}

/**
 * Fixed-position placement for a popover anchored under (or, when there is
 * more room, above) a trigger. `maxHeight` shrinks to the space on the chosen
 * side so the popover never runs off-screen; its list scrolls instead.
 */
export function placePopover(
  rect: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
  size: { width: number; maxHeight: number },
  gap = 8,
): { left: number; top?: number; bottom?: number; maxHeight: number } {
  const left = Math.max(gap, Math.min(rect.left, viewport.width - size.width - gap));
  const spaceBelow = viewport.height - rect.bottom - 2 * gap;
  const spaceAbove = rect.top - 2 * gap;
  if (spaceBelow >= size.maxHeight || spaceBelow >= spaceAbove) {
    return { left, top: rect.bottom + gap, maxHeight: Math.min(size.maxHeight, spaceBelow) };
  }
  return { left, bottom: viewport.height - rect.top + gap, maxHeight: Math.min(size.maxHeight, spaceAbove) };
}
