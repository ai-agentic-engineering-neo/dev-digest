/* Pure helpers for the Conventions page — no React, no fetch. */

/** Confidence tiers: green >=0.8, amber >=0.6, else red (server/specs/conventions.md's client outline). */
export function confidenceColor(value: number): string {
  if (value >= 0.8) return "var(--ok)";
  if (value >= 0.6) return "var(--warn)";
  return "var(--crit)";
}

/** Small relative-time label for "last scan <when>" — no page elsewhere needs this yet. */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
