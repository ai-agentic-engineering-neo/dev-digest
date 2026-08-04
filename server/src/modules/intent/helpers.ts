/**
 * Pure helpers for the intent module (side-effect free; operate purely on
 * their arguments), matching `reviews/helpers.ts`'s convention.
 */

/** A PR body under this many trimmed characters counts as "empty/near-empty"
 *  for context-gap detection (specs/05-intent-layer.md's Call sequence step 5). */
export const INDIRECT_BODY_THRESHOLD = 40;

export interface ContextGapInput {
  body: string | null;
  issueNumberParsed: number | null;
  hasResolvedIssue: boolean;
  specPathParsed: string | null;
  hasResolvedSpec: boolean;
}

/**
 * Deterministic context-gap detection (revision 2 — replaces v1's confidence
 * ceiling, same underlying principle: never trust the model's self-report
 * alone, the `groundFindings`/score precedent, generalized). Computed purely
 * from the signals already gathered by `service.ts`'s `resolve()` — the model
 * is never asked to self-assess confidence; gaps are named, not scored.
 */
export function detectContextGaps(input: ContextGapInput): string[] {
  const gaps: string[] = [];
  if ((input.body ?? '').trim().length < INDIRECT_BODY_THRESHOLD) {
    gaps.push('PR description is empty or near-empty');
  }
  if (input.issueNumberParsed != null && !input.hasResolvedIssue) {
    gaps.push(`referenced issue #${input.issueNumberParsed} could not be resolved`);
  }
  if (input.specPathParsed != null && !input.hasResolvedSpec) {
    gaps.push(`referenced spec ${input.specPathParsed} could not be read`);
  }
  return gaps;
}

/** Render the single composite string threaded into the review prompt's
 *  free-text `intent` slot (kept for backward-compatible narrative context
 *  alongside the new structured `intentScope` slot — see prompt.ts). */
export function renderIntentText(summary: string, signals: string[]): string {
  const derivedFrom = signals.length > 0 ? signals.join(', ') : 'PR title only';
  return `Summary: ${summary}\nDerived from: ${derivedFrom}`;
}
