/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/**
 * L03 — overall budget for the pre-work intent derive in `executeRuns`
 * (`container.intent.derive`). On top of `modules/intent/constants.ts`'
 * REVIEW_TIMEOUT_MS/REVIEW_MAX_RETRIES (which bound the LLM call itself),
 * this bounds the WHOLE derive (source gathering + classification) so a slow
 * GitHub fetch cannot meaningfully delay the review it's a courtesy to.
 */
export const INTENT_REVIEW_BUDGET_MS = 45_000;
