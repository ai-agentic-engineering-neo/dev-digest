import type { PrMeta } from "@/lib/types";
import { POPOVER_FLIP_SPACE, POPOVER_GAP, POPOVER_WIDTH } from "./constants";

export type PrFindings = NonNullable<PrMeta["findings"]>;

/** Contract-cased counts for SeverityTally from the list endpoint's lower-cased summary. */
export function toCounts(f: PrFindings) {
  return { CRITICAL: f.critical, WARNING: f.warning, SUGGESTION: f.suggestion };
}

export function totalOf(f: PrFindings): number {
  return f.critical + f.warning + f.suggestion;
}

/**
 * Fixed-position placement from the cell's viewport rect. Fixed (not absolute)
 * because the list's table card clips overflow; flips upward near the bottom
 * edge and never leaves the viewport horizontally.
 */
export function placePopover(
  rect: { top: number; bottom: number; right: number },
  viewport: { width: number; height: number },
): { left: number; top?: number; bottom?: number } {
  const left = Math.max(8, Math.min(rect.right - POPOVER_WIDTH, viewport.width - POPOVER_WIDTH - 8));
  if (viewport.height - rect.bottom < POPOVER_FLIP_SPACE && rect.top > POPOVER_FLIP_SPACE) {
    return { left, bottom: viewport.height - rect.top + POPOVER_GAP };
  }
  return { left, top: rect.bottom + POPOVER_GAP };
}
