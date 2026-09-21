/** `num / den` as a percentage with one decimal; null when there is nothing to divide by. */
export function toPercent(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}
