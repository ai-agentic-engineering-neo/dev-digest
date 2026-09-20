/** Shared date formatters — used across reviews, comments, and PR list. */

/**
 * Full locale datetime string for a review/comment timestamp.
 * `null`/`undefined`/unparseable → the input string as-is (fallback for display).
 */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * Compact relative time for the PR list's UPDATED column (e.g. "3h", "2d").
 * `null`/`undefined`/unparseable → "—" (unknown/not applicable).
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
