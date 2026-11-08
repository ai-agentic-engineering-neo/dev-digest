import type { MouseEvent } from "react";
import type { BlastDegradedReason, PrBlastRadius } from "@/lib/types";
import { MAP_COMPUTED_REASONS, RESYNC_REASONS } from "./constants";

export function canResync(reason: BlastDegradedReason | null): boolean {
  return reason !== null && RESYNC_REASONS.includes(reason);
}

/** False when the map was never computed (no_data / index_failed): an empty list must not read as "no callers". */
export function isMapComputed(data: Pick<PrBlastRadius, "degraded" | "reason">): boolean {
  return !data.degraded || (data.reason !== null && MAP_COMPUTED_REASONS.includes(data.reason));
}

export function symbolsWithoutCallers(data: Pick<PrBlastRadius, "counts" | "downstream">): number {
  return Math.max(0, data.counts.symbols - data.downstream.length);
}

/**
 * onMouseDown for full-row toggles (symbol header, prior-PRs row): a mouse click must not focus the
 * button, so its focus ring (`:focus-visible` in styles.css) appears only for keyboard focus.
 * Click still fires; Tab/Enter/Space are unaffected.
 */
export function preventMouseFocus(e: MouseEvent<HTMLElement>): void {
  e.preventDefault();
}
