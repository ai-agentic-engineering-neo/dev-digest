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
 * specs/13-multi-agent-review.md — conflict matching (D-P1).
 *
 * A finding whose kind is one of these four grounds against "the file exists
 * in the diff", not a specific line range (reviewer-core's citation gate,
 * `reviewer-core/src/grounding.ts:16`, which is NOT exported — D4 forbids
 * editing reviewer-core). Duplicated here on purpose; `constants.test.ts`
 * pins this exact list so a future divergence between the two copies is loud
 * on our side rather than silently drifting.
 */
export const FULL_FILE_KINDS = new Set(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);

/**
 * A line-ranged finding whose [start_line, end_line] span (inclusive line
 * count) exceeds this many lines is treated as file-scoped for conflict
 * matching (D-P1) — a huge range floods line-intersection matching the same
 * way a genuinely full-file finding would.
 */
export const CONFLICT_MAX_RANGE_LINES = 50;

/** A conflict take's `note` is the first line of the flagging finding's
 *  rationale, truncated to this many characters (AC-39). */
export const CONFLICT_NOTE_MAX_CHARS = 160;
