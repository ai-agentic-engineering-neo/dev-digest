/** A stable palette for the category donut — cycles for any number of
 * categories rather than hard-coding the review taxonomy. */
const PALETTE = [
  "var(--accent)",
  "var(--warn)",
  "var(--crit)",
  "var(--ok)",
  "var(--info)",
  "var(--sugg)",
];

export function categoryColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? "var(--text-muted)";
}
