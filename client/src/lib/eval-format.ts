/** eval-format.ts — shared formatters for the Eval Pipeline client surfaces
 *  (the agent editor's Evals tab, the /eval dashboard, the /eval/agents/:id
 *  detail page). AC-20: a null ratio is "not applicable", never a fake 0 —
 *  the caller supplies its own translated "n/a" string rather than this
 *  module hardcoding English. */

/** A nullable 0..1 ratio → a rounded percentage string, or `naLabel`. */
export function formatMetricPct(value: number | null | undefined, naLabel: string): string {
  return value == null ? naLabel : `${Math.round(value * 100)}%`;
}

/** A signed metric delta (already 0..1-scaled) → "+3.2pp" / "-1.0pp", or
 *  `naLabel` when either side of the delta was null. Percentage POINTS, not
 *  a relative percentage, since these are already percentages. */
export function formatMetricDeltaPct(value: number | null | undefined, naLabel: string): string {
  if (value == null) return naLabel;
  const pts = value * 100;
  const sign = pts > 0 ? "+" : "";
  return `${sign}${pts.toFixed(1)}pp`;
}
