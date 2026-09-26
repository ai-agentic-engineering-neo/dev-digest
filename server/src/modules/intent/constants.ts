/**
 * Intent layer constants. Every cap here bounds either what is fetched for a
 * PR (sources), what reaches the classifier (prompt budget) or what is stored
 * (output caps). Pure values only — no I/O, no env.
 */

// --- Source caps (how many of each reference kind are followed) -------------
export const MAX_ISSUES = 3;
export const MAX_DOCS = 5;
export const MAX_URLS = 3;

// --- Per-source fetch limits ------------------------------------------------
export const SOURCE_TIMEOUT_MS = 5000;
export const MAX_SOURCE_BYTES = 256 * 1024;
export const MAX_SOURCE_CHARS = 12000;

// --- Prompt budget ----------------------------------------------------------
export const MAX_DESCRIPTION_CHARS = 4000;
/** Estimated tokens the classifier input may use (hunk headers are trimmed first). */
export const INPUT_TOKEN_BUDGET = 8000;
/** The PR body is scanned for references only up to this many chars (bounds regex work). */
export const MAX_BODY_SCAN_CHARS = 20_000;
/** Never trim a fetched-doc section below this many chars while fitting the budget. */
export const MIN_TRIMMED_SECTION_CHARS = 500;
/** Each hunk header (`@@ … @@ <context>`) is clipped to this many chars. */
export const MAX_HUNK_HEADER_CHARS = 200;

// --- Output caps (applied to the model's answer before it is stored) --------
export const MAX_INTENT_CHARS = 600;
export const MAX_LIST_ITEMS = 8;
export const MAX_LIST_ITEM_CHARS = 200;
