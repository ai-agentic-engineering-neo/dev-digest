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
  /** The PR discusses a specification but no usable path could be extracted.
   *  Previously this failed silently — with no parsed path there was nothing
   *  to report, so a spec that never reached the prompt looked identical to a
   *  PR that never had one. */
  mentionsSpecWithoutPath?: boolean;
  /** Spec-shaped paths that were available but NOT selected. Surfacing them
   *  makes the choice checkable instead of invisible. */
  unusedSpecCandidates?: string[];
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
  // The silent-failure case: the PR talks about a spec, but nothing usable
  // came out of it, so no spec reached the prompt and — before this branch —
  // nothing said so. Deliberately NOT reported when the PR simply never
  // mentions a spec: most PRs have none, and crying wolf on all of them would
  // train readers to ignore the line that matters.
  if (input.specPathParsed == null && input.mentionsSpecWithoutPath === true) {
    gaps.push('PR references a specification but no spec document could be identified');
  }
  const unused = input.unusedSpecCandidates ?? [];
  if (unused.length > 0) {
    gaps.push(`other spec-shaped documents not used: ${unused.join(', ')}`);
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
