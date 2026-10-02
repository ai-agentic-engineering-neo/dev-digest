/** Pure helpers for the Conventions page — kept free of hooks so they're
 *  testable without rendering. */

/** "just now" / "5m ago" / "3h ago" / "2d ago" — coarse, no library needed for
 *  the one relative timestamp this page shows ("last scan …"). */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
