import type { ConventionCandidate } from "@devdigest/shared";

/** Accepted candidates in display order — the order they're merged into the skill. */
export function acceptedOf(candidates: ConventionCandidate[]): ConventionCandidate[] {
  return candidates.filter((c) => c.status === "accepted");
}

/**
 * The bulk action for the toolbar: un-accept everything once anything is
 * accepted, otherwise accept every undecided candidate. Null when neither applies.
 */
export function bulkAction(candidates: ConventionCandidate[]): "deselectAll" | "acceptAll" | null {
  if (candidates.some((c) => c.status === "accepted")) return "deselectAll";
  if (candidates.some((c) => c.status === "pending")) return "acceptAll";
  return null;
}
