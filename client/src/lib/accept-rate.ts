/** Accept-rate colour shared by the Agents and Skills cards: ≥ 60% ok, ≥ 45% warn, else critical. */
export function acceptColor(rate: number): string {
  if (rate >= 0.6) return "var(--ok)";
  if (rate >= 0.45) return "var(--warn)";
  return "var(--crit)";
}

/** 0.734 → 73 (whole percent for "N% accept" / "N% pull" labels). */
export function toPct(rate: number): number {
  return Math.round(rate * 100);
}
