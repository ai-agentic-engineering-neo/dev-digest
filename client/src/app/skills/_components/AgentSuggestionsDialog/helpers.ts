/** Pure state helpers for AgentSuggestionsDialog (no React). */
import type { AgentSuggestion } from "@devdigest/shared";

export type Decision = "accept" | "reject";
export const DECISIONS = ["accept", "reject"] as const satisfies readonly Decision[];

/** Per-agent outcome of a confirm; absent = not tried yet. */
export type LinkOutcome = "linked" | "failed";

/** The user's choice, falling back to the server's preselect. */
export function decisionOf(s: AgentSuggestion, overrides: Readonly<Record<string, Decision>>): Decision {
  return overrides[s.agent_id] ?? (s.preselected ? "accept" : "reject");
}

/** Agents a confirm would link now: accepted and not linked yet (failed ones are retried). */
export function agentsToLink(
  list: readonly AgentSuggestion[],
  overrides: Readonly<Record<string, Decision>>,
  outcomes: Readonly<Record<string, LinkOutcome>>,
): string[] {
  return list
    .filter((s) => decisionOf(s, overrides) === "accept" && outcomes[s.agent_id] !== "linked")
    .map((s) => s.agent_id);
}

/** allSettled results (same order as `ids`) → the merged per-agent outcomes. */
export function mergeOutcomes(
  prev: Readonly<Record<string, LinkOutcome>>,
  ids: readonly string[],
  results: readonly PromiseSettledResult<unknown>[],
): Record<string, LinkOutcome> {
  const next: Record<string, LinkOutcome> = { ...prev };
  ids.forEach((id, i) => {
    next[id] = results[i]?.status === "fulfilled" ? "linked" : "failed";
  });
  return next;
}

export function countOutcome(outcomes: Readonly<Record<string, LinkOutcome>>, kind: LinkOutcome): number {
  return Object.values(outcomes).filter((o) => o === kind).length;
}
