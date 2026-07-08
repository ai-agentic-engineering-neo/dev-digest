import type { Conflict } from "@devdigest/shared";

/** AC-23: a group is "divergent" when its agents don't all agree — at least
    one flagged and at least one did-not-flag ('ignored'), or the flagged
    takes carry different severities. Purely deterministic (no LLM/semantic
    comparison), matching the server's grouping rule (AC-21). */
export function isConflictDivergent(c: Conflict): boolean {
  const verdicts = new Set(c.takes.map((t) => t.verdict));
  return verdicts.size > 1;
}
