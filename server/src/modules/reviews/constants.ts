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
 * A review never waits longer than this for intent — OpenRouter's own
 * retries on a slow structured call can take minutes, and a review must
 * still complete (without an intent section) rather than hang on it.
 */
export const INTENT_STEP_DEADLINE_MS = 90_000;
