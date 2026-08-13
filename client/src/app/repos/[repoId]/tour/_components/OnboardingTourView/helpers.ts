/** DOM anchor id for a section — shared by `TourToc`'s links and each
 *  `SectionCard`'s heading, so a ToC click actually scrolls to something. */
export function sectionAnchorId(kind: string): string {
  return `tour-section-${kind}`;
}

/**
 * Coarse relative-time label ("now" / "3m" / "2h" / "5d"). Colocated rather
 * than shared: this is the same shape as `repos/[repoId]/pulls/helpers.ts`'s
 * `relativeTime`, but that one has exactly one consumer today too — promote
 * both to `src/lib` together on a third consumer, not in anticipation of one
 * (frontend-ui-architecture: colocate, promote on the second/third use).
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
