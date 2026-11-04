import type { PrMeta } from "@/lib/types";
import { POPOVER_FLIP_SPACE, POPOVER_GAP, POPOVER_WIDTH, VIEWPORT_MARGIN } from "./constants";

export type PrFindings = NonNullable<PrMeta["findings"]>;

/** Contract-cased counts for SeverityTally from the list endpoint's lower-cased summary. */
export function toCounts(f: PrFindings) {
  return { CRITICAL: f.critical, WARNING: f.warning, SUGGESTION: f.suggestion };
}

export function totalOf(f: PrFindings): number {
  return f.critical + f.warning + f.suggestion;
}

export type PopoverPlacement = { left: number; top?: number; bottom?: number; maxHeight: number };

/**
 * Fixed-position placement from the cell's viewport rect. Fixed (not absolute)
 * because the list's table card clips overflow; flips upward near the bottom
 * edge and never leaves the viewport horizontally. `maxHeight` is the space
 * actually available in the chosen direction - the popover scrolls beyond it,
 * so it can't run off-screen on a short viewport (no DOM measuring needed).
 */
export function placePopover(
  rect: { top: number; bottom: number; right: number },
  viewport: { width: number; height: number },
): PopoverPlacement {
  const m = VIEWPORT_MARGIN;
  const left = Math.max(m, Math.min(rect.right - POPOVER_WIDTH, viewport.width - POPOVER_WIDTH - m));
  if (viewport.height - rect.bottom < POPOVER_FLIP_SPACE && rect.top > POPOVER_FLIP_SPACE) {
    return {
      left,
      bottom: viewport.height - rect.top + POPOVER_GAP,
      maxHeight: rect.top - POPOVER_GAP - m,
    };
  }
  const top = rect.bottom + POPOVER_GAP;
  return { left, top, maxHeight: Math.max(0, viewport.height - top - m) };
}
