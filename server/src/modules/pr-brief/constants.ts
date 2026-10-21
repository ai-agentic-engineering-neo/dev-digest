/** pr-brief — constants (ring 2). */

export const GENERATE_JOB_KIND = 'pr-brief.generate';

/** A run still `running` after this long was orphaned; `generate()` fails it and starts over. */
export const STALE_RUN_MS = 10 * 60_000;

/** Deadline of the one model call; below the 120 s job timeout so the run ends `failed`, not orphaned. */
export const BRIEF_CALL_TIMEOUT_MS = 90_000;

/** Input caps (not settings). */
export const MAX_FILE_CHARS = 6_000;
export const MAX_TOTAL_CHARS = 60_000;
export const MAX_FINDINGS = 30;
export const MAX_RATIONALE_CHARS = 200;
export const MAX_SYMBOLS = 10;
export const MAX_CALLERS = 5;

/** Output trims. */
export const MAX_SUMMARY_CHARS = 400;
export const MAX_RISKS = 5;
export const MAX_FOCUS = 6;

/** Longest error text stored on a failed run. */
export const MAX_ERROR_CHARS = 500;

/** Shown in the run drawer title. */
export const TRACE_AGENT_NAME = 'PR Brief';
export const TOOL_NAME = 'generate_brief';

export const INVALID_BRIEF_ERROR = 'The model returned an invalid brief';
export const PULL_REMOVED_ERROR = 'Pull request was removed';

/** Per-route limit on POST generate (each call is one model call). */
export const RATE_LIMIT = { max: 6, timeWindow: '1 minute' } as const;
