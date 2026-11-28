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
 * Output-token cap for every review call (XC-5). The largest legitimate answer
 * is a long findings list (~100 findings of ~150 tokens) plus the reasoning
 * tokens a reasoning model bills as completion tokens (1.6K-7.7K in the
 * recorded runs, reviewer-core/INSIGHTS.md), so well under 16K. The one
 * runaway on record used 264K completion tokens over 20 minutes. 16384 is also
 * the largest cap every supported model accepts (gpt-4o rejects more), and is
 * 4x the Anthropic adapter's own 4096 fallback, which would truncate long
 * reviews.
 */
export const REVIEW_MAX_OUTPUT_TOKENS = 16_384;

/**
 * Cap on the diff sent to the model, in characters. About 3.35 chars per token
 * puts 200K chars near 60K tokens: inside a 128K context together with the
 * prompt scaffolding and REVIEW_MAX_OUTPUT_TOKENS. Beyond it whole files are
 * dropped (never half a hunk) and the run is marked partial.
 */
export const MAX_DIFF_CHARS = 200_000;
