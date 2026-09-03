import type { Finding } from '@devdigest/shared';

/**
 * Per-severity penalty subtracted from a perfect 100. Chosen so the score
 * tracks the findings the UI actually shows: 0 findings ⇒ 100, one suggestion
 * ⇒ 97, one warning ⇒ 88, one critical ⇒ 65.
 */
const SEVERITY_PENALTY: Record<Finding['severity'], number> = {
  CRITICAL: 35,
  WARNING: 12,
  SUGGESTION: 3,
};

/**
 * Ceiling on how much WARNING + SUGGESTION findings, combined, can drag the
 * score down. A large diff naturally accumulates dozens of low-severity
 * findings — left uncapped, the additive penalty blows past 100 long before a
 * single CRITICAL appears, and the score floors at 0 indistinguishably from a
 * PR full of criticals. Below this cap the score behaves exactly as before
 * (one warning ⇒ 88, etc.); above it, more warnings/suggestions stop moving
 * the number. CRITICAL is deliberately NOT capped — a handful of real
 * criticals should still floor the score, and that signal is correct.
 */
const NON_CRITICAL_PENALTY_CAP = 70;

/**
 * Deterministic 0–100 quality score derived from the (grounded) findings —
 * NOT the model's self-reported `score`, which has no anchor and drifts wildly
 * between models (a cheap model can "approve" with zero findings yet emit 10).
 * This mirrors how the review *event* is already computed from severities in
 * `to-review.ts`, so the number on screen can never contradict the findings
 * beneath it.
 */
export function scoreFromFindings(findings: Finding[]): number {
  const criticalPenalty = findings
    .filter((f) => f.severity === 'CRITICAL')
    .reduce((sum) => sum + SEVERITY_PENALTY.CRITICAL, 0);
  const nonCriticalPenalty = findings
    .filter((f) => f.severity !== 'CRITICAL')
    .reduce((sum, f) => sum + (SEVERITY_PENALTY[f.severity] ?? 0), 0);
  const penalty = criticalPenalty + Math.min(nonCriticalPenalty, NON_CRITICAL_PENALTY_CAP);
  return Math.max(0, Math.min(100, 100 - penalty));
}
