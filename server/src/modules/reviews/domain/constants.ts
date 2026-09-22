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

/** Grounding summary of a run that produced no findings to ground. */
export const NO_GROUNDING = '0/0 passed';

/** Error note stored on a run the user cancelled. */
export const CANCELLED_NOTE = 'Cancelled by user';

/** Rows per `getCallerSignatures` call — keeps the callers section ≲600 tokens. */
export const CALLERS_LIMIT = 10;

/** A changed file at/above this rank percentile counts as "hot" (top 5%). */
export const HOT_FILE_PERCENTILE = 95;
