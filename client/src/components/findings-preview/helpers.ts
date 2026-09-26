import type { FindingRecord, FindingsBySeverity, ReviewRecord } from "@devdigest/shared";

/** Severity display order — also the preview's primary sort key. */
export const PREVIEW_SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

/** How many findings a hover preview shows before it summarises the rest. */
export const PREVIEW_LIMIT = 5;

/** Card box, in px. Fixed so the anchor math can clamp against the viewport. */
export const CARD_WIDTH = 400;
export const CARD_MAX_HEIGHT = 340;

/** Gap kept between the card and both the anchor and the viewport edge. */
const CARD_MARGIN = 8;

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** An all-zero tally — "nothing found", never "nothing known". */
export function emptyCounts(): FindingsBySeverity {
  return { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
}

/** Tally a finding list by severity. Unknown severities are ignored. */
export function countBySeverity(findings: FindingRecord[]): FindingsBySeverity {
  const counts = emptyCounts();
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as keyof FindingsBySeverity] += 1;
  }
  return counts;
}

/**
 * Each agent's LATEST review — the reviews the PR list's FINDINGS column counts.
 * Older reviews by the same agent are dropped, so re-running one agent replaces
 * its contribution instead of stacking on it. Reviews with no `agent_id` (seeded
 * or pre-`run_id`) form a single bucket: the newest of them wins. Mirrors the
 * server's `pickLatestReviewIds`; keep the two in step.
 */
export function latestReviewPerAgent(reviews: ReviewRecord[]): ReviewRecord[] {
  const newestFirst = [...reviews].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );
  const seen = new Set<string>();
  return newestFirst.filter((r) => {
    const key = r.agent_id ?? "";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Severity first, then confidence descending: the preview shows five findings
 * out of however many, so the five it picks must be the five worth reading.
 */
export function sortForPreview(findings: FindingRecord[]): FindingRecord[] {
  const rank = (sev: string) => {
    const i = PREVIEW_SEVERITIES.indexOf(sev as (typeof PREVIEW_SEVERITIES)[number]);
    return i === -1 ? PREVIEW_SEVERITIES.length : i;
  };
  return [...findings].sort(
    (a, b) => rank(a.severity) - rank(b.severity) || b.confidence - a.confidence,
  );
}

/**
 * Viewport coordinates for a card anchored under `rect`.
 *
 * The card is `position: fixed` (a list row's container clips absolutely
 * positioned children), so it has to be clamped by hand: horizontally against
 * both edges, and flipped ABOVE the anchor when it would run off the bottom —
 * otherwise the last rows of a long list open a card nobody can read.
 */
export function anchorFor(
  rect: { top: number; bottom: number; left: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const left = Math.max(
    CARD_MARGIN,
    Math.min(rect.left, viewport.width - CARD_WIDTH - CARD_MARGIN),
  );
  const below = rect.bottom + CARD_MARGIN;
  const fitsBelow = below + CARD_MAX_HEIGHT + CARD_MARGIN <= viewport.height;
  const top = fitsBelow
    ? below
    : Math.max(CARD_MARGIN, rect.top - CARD_MAX_HEIGHT - CARD_MARGIN);
  return { top, left };
}
