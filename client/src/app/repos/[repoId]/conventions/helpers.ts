import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CONFIDENCE_BANDS, type FilterKey } from "./constants";

/** Pure helpers for the Conventions board — filtering, counting, selection. */

export type StatusCounts = Record<FilterKey, number>;

/** How many candidates each triage chip should show. */
export function countByStatus(candidates: ConventionCandidate[]): StatusCounts {
  const counts: StatusCounts = { all: candidates.length, pending: 0, accepted: 0, rejected: 0 };
  for (const c of candidates) counts[c.status] += 1;
  return counts;
}

/** The candidates a triage chip shows. `all` keeps the server's order. */
export function filterByStatus(
  candidates: ConventionCandidate[],
  filter: FilterKey,
): ConventionCandidate[] {
  return filter === "all" ? candidates : candidates.filter((c) => c.status === filter);
}

/** Toggle one id in a selection set, returning a new set. */
export function toggleSelected(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

/**
 * Drop ids that are no longer on the board. A re-scan replaces the pending rows
 * with new ones, so a stale selection would otherwise ask the server to build a
 * skill from candidates that no longer exist.
 */
export function pruneSelection(
  selected: Set<string>,
  candidates: ConventionCandidate[],
): Set<string> {
  const live = new Set(candidates.map((c) => c.id));
  return new Set([...selected].filter((id) => live.has(id)));
}

/** The ids of every candidate in a given state — backs "select all accepted". */
export function idsWithStatus(
  candidates: ConventionCandidate[],
  status: ConventionStatus,
): string[] {
  return candidates.filter((c) => c.status === status).map((c) => c.id);
}

/**
 * Colour for a confidence percentage: green from 85, yellow from 70, orange
 * from 60, red below that. Takes the ALREADY-ROUNDED percentage the card
 * displays, so the colour can never disagree with the number beside it.
 */
export function confidenceColor(pct: number): string {
  const band = CONFIDENCE_BANDS.find((b) => pct >= b.min);
  // The bands end at 0, so only a negative or NaN score falls through.
  return band?.color ?? CONFIDENCE_BANDS[CONFIDENCE_BANDS.length - 1]!.color;
}

/**
 * Deep-link a citation to the exact line on GitHub. `full_name` is `owner/repo`
 * and the branch is the repo's default — the scan reads the working tree, so
 * the line is only guaranteed to match while the clone is in sync.
 */
export function evidenceUrl(
  fullName: string | undefined,
  branch: string | undefined,
  path: string,
  line: number,
): string | null {
  if (!fullName || !path) return null;
  return githubBlobUrl(fullName, branch || "main", path, line);
}
