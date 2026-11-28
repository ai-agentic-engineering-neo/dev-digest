import { POPOVER_MIN_ROOM, POPOVER_WIDTH, VIEWPORT_MARGIN } from "./constants";
import type { PopoverAnchor } from "./styles";

/** The cell's box, as returned by getBoundingClientRect(). */
export type CellRect = Pick<DOMRect, "left" | "top" | "bottom">;

/** Viewport size in px. */
export type Viewport = { width: number; height: number };

/**
 * Pin the preview under the cell, or above it when there is no room below.
 * The left edge is clamped so the preview stays inside the viewport.
 */
export function popoverAnchor(rect: CellRect, viewport: Viewport): PopoverAnchor {
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(rect.left, viewport.width - POPOVER_WIDTH - VIEWPORT_MARGIN),
  );
  const roomBelow = viewport.height - rect.bottom;
  return roomBelow < POPOVER_MIN_ROOM && rect.top > roomBelow
    ? { left, bottom: viewport.height - rect.top }
    : { left, top: rect.bottom };
}
