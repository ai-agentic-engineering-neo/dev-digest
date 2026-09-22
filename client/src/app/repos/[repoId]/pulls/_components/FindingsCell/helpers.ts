import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { SeverityCounts } from "@/lib/types";
import { CARD_MAX_HEIGHT, CARD_WIDTH, SEVERITY_ORDER, VIEWPORT_MARGIN } from "./constants";

/**
 * Every still-outstanding finding of a PR, newest-run-first flattened and
 * sorted by severity. Dismissed findings are dropped so the card's header count
 * matches the three counters (which the server computes the same way).
 */
export function cardFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  return (reviews ?? [])
    .flatMap((r) => r.findings)
    // `findings.severity` is an unconstrained text column, and the server's
    // rollupSeverities silently ignores anything outside the three. Match it,
    // or the card would list a row the counters never counted.
    .filter((f) => !f.dismissed_at && SEVERITY_ORDER[f.severity] != null)
    .sort((a, b) => SEVERITY_ORDER[a.severity]! - SEVERITY_ORDER[b.severity]!);
}

/** `src/api/users.ts:45` — or `:45-52` when the finding spans lines. */
export function fileRef(f: Pick<FindingRecord, "file" | "start_line" | "end_line">): string {
  return f.end_line > f.start_line
    ? `${f.file}:${f.start_line}-${f.end_line}`
    : `${f.file}:${f.start_line}`;
}

/** True when the PR has been reviewed but has nothing left to show. */
export function isEmptyCounts(counts: SeverityCounts): boolean {
  return counts.critical === 0 && counts.warning === 0 && counts.suggestion === 0;
}

/**
 * Place the card against its trigger. The card is portalled and `position:
 * fixed` (the PR table clips `overflow: hidden`), so it is positioned in
 * VIEWPORT coordinates — no scroll offsets. Flips above when there isn't room
 * below, and is clamped so a wide card never runs off a narrow window.
 */
export function cardPosition(
  rect: { top: number; bottom: number; left: number },
  viewport: { width: number; height: number },
): { top: number; left: number } {
  const below = viewport.height - rect.bottom;
  const flip = below < CARD_MAX_HEIGHT + VIEWPORT_MARGIN && rect.top > below;
  const top = flip ? Math.max(VIEWPORT_MARGIN, rect.top - CARD_MAX_HEIGHT - 8) : rect.bottom + 8;
  const maxLeft = viewport.width - CARD_WIDTH - VIEWPORT_MARGIN;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));
  return { top, left };
}
