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

// ---- PR intent (derived before review) --------------------------------------

/** Per-field caps (characters) on untrusted text sent to the derivation call. */
export const INTENT_TITLE_CHARS = 300;
export const INTENT_BODY_CHARS = 4000;
export const INTENT_BRANCH_CHARS = 200;
export const INTENT_COMMIT_LIMIT = 30;
export const INTENT_COMMIT_CHARS = 200;
export const INTENT_PATH_LIMIT = 150;
export const INTENT_ISSUE_TITLE_CHARS = 300;
export const INTENT_ISSUE_BODY_CHARS = 3000;
export const INTENT_DOC_CHARS = 6000;
/** Total untrusted characters (~6k tokens) sent to the derivation call. */
export const INTENT_TOTAL_CHARS = 24_000;

export const INTENT_MAX_ISSUES = 5;
export const INTENT_MAX_DOCS = 5;
export const INTENT_MAX_TICKET_KEYS = 10;
/** A body shorter than this counts as thin: confidence stays low without a ticket or spec. */
export const THIN_BODY_CHARS = 200;
export const INTENT_MAX_PATH_CHARS = 300;
export const INTENT_MAX_REF_CHARS = 200;

/** Each GitHub / git source call, and the whole derivation. */
export const INTENT_SOURCE_TIMEOUT_MS = 8_000;
export const INTENT_TOTAL_TIMEOUT_MS = 35_000;
export const INTENT_LLM_TIMEOUT_MS = 20_000;

export const INTENT_DOC_EXTENSIONS = ['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc'] as const;

/** Words that look like Jira keys (`UTF-8`, `SHA-256`) or branch prefixes (`feat-12`), never tickets. */
export const TICKET_KEY_STOPLIST: ReadonlySet<string> = new Set([
  'UTF', 'SHA', 'ISO', 'CVE', 'RFC', 'HTTP', 'TLS', 'AES', 'ES',
  'FEAT', 'FIX', 'CHORE', 'DOCS', 'TEST', 'REFACTOR', 'PERF', 'CI', 'BUILD', 'STYLE', 'HOTFIX', 'RELEASE', 'BUG', 'PR',
]);
