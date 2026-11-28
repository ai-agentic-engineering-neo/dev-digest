/** A 0..1 rate as a whole percent; null/undefined (no data yet) → "—". */
export function formatRate(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}
