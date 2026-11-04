/** Popover width (px) — also used to right-align it under the cell. */
export const POPOVER_WIDTH = 340;
/** Gap between the cell and the popover (px). */
export const POPOVER_GAP = 6;
/** Below this much space under the cell, the popover opens upward (px). */
export const POPOVER_FLIP_SPACE = 280;
/** Min distance kept between the popover and the viewport edge (px). */
export const VIEWPORT_MARGIN = 8;
/**
 * Mouse-leave close delay (ms). The popover sits POPOVER_GAP px away from the
 * cell, so crossing that gap leaves both elements; re-entering the popover (a DOM
 * child of the trigger) fires mouseenter again and cancels the pending close.
 */
export const CLOSE_DELAY_MS = 150;
