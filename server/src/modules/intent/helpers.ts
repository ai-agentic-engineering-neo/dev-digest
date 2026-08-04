import type { IntentConfidence } from '@devdigest/shared';

/**
 * Pure helpers for the intent module (side-effect free; operate purely on
 * their arguments), matching `reviews/helpers.ts`'s convention.
 */

/** A PR body under this many trimmed characters counts as "empty/near-empty"
 *  for the confidence ceiling (specs/05-intent-layer.md's Call sequence step 5). */
export const INDIRECT_BODY_THRESHOLD = 40;

/**
 * Deterministic confidence ceiling — never trust the model's self-reported
 * `confidence` alone (the `groundFindings`/score precedent, generalized). A
 * PR that is "indirect-only" (near-empty body AND no ticket/spec resolved) is
 * force-capped to 'low' regardless of what the model claims.
 */
export function applyConfidenceCeiling(
  modelConfidence: IntentConfidence,
  body: string | null,
  hasResolvedIssue: boolean,
  hasResolvedSpec: boolean,
): IntentConfidence {
  const indirectOnly =
    (body ?? '').trim().length < INDIRECT_BODY_THRESHOLD && !hasResolvedIssue && !hasResolvedSpec;
  return indirectOnly ? 'low' : modelConfidence;
}

/** Render the single composite string threaded into the review prompt's
 *  `intent` slot and shown in the UI's "Derived from: …" line. */
export function renderIntentText(
  summary: string,
  confidence: IntentConfidence,
  signals: string[],
): string {
  const derivedFrom = signals.length > 0 ? signals.join(', ') : 'PR title only';
  return `Summary: ${summary}\nConfidence: ${confidence}\nDerived from: ${derivedFrom}`;
}
