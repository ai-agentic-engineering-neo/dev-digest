/** Pure helpers for the Conventions page. No hooks, no fetch. */

import type { ConventionCandidate, ConventionExtractResult } from "@devdigest/shared";

/** Accepted candidates, in board order. */
export function acceptedOf(candidates: ConventionCandidate[]): ConventionCandidate[] {
  return candidates.filter((c) => c.status === "accepted");
}

/** Candidates that survived the evidence gate out of what the model proposed. */
export function groundedCount(scan: Pick<ConventionExtractResult, "proposed" | "dropped_ungrounded">): number {
  return Math.max(0, scan.proposed - scan.dropped_ungrounded);
}
