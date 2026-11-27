/** Pure state helpers for AgentSuggestionsDialog (no React). */
import type { AgentSuggestion } from "@devdigest/shared";

/**
 * Per-agent state of a row. Absent = untouched. Accept links at once
 * (`linking` → `linked`, or `failed` → Accept again retries); Reject only
 * hides the row (nothing is written).
 */
export type RowState = "linking" | "linked" | "failed";

/** Rows still on screen: everything the user has not rejected. */
export function visibleSuggestions(
  list: readonly AgentSuggestion[],
  rejected: ReadonlySet<string>,
): AgentSuggestion[] {
  return list.filter((s) => !rejected.has(s.agent_id));
}

/** Every suggestion is decided: rejected, or linked. */
export function allDecided(
  list: readonly AgentSuggestion[],
  rejected: ReadonlySet<string>,
  states: Readonly<Record<string, RowState>>,
): boolean {
  return list.every((s) => rejected.has(s.agent_id) || states[s.agent_id] === "linked");
}

export function countState(states: Readonly<Record<string, RowState>>, kind: RowState): number {
  return Object.values(states).filter((st) => st === kind).length;
}
