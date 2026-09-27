/**
 * Intent-layer constants (one module, so they live here rather than shared).
 * Every cap exists to bound prompt size, cost or attack surface — see
 * docs/specs/intent-layer.md.
 */

/** Feature key resolved through Settings → Models. */
export const INTENT_FEATURE_ID = 'review_intent' as const;
/** Structured-output schema name sent to the provider. */
export const INTENT_SCHEMA_NAME = 'pr_intent';
/** Bump when the classifier prompt/schema changes so cached rows regenerate. */
export const INTENT_PROMPT_VERSION = 1;

// ---- evidence caps --------------------------------------------------------
export const MAX_LINKED_ISSUES = 3;
export const MAX_PLAN_DOCS = 3;
export const MAX_UNRESOLVED_REFS = 5;
export const MAX_EXTERNAL_REFS = 5;
export const ISSUE_BODY_CHARS = 4000;
export const PLAN_DOC_CHARS = 8000;
export const DESCRIPTION_CHARS = 4000;
export const MAX_COMMITS = 50;
export const COMMIT_MESSAGE_CHARS = 500;
export const MAX_PATHS = 300;
export const DIFF_EXCERPT_CHARS = 12_000;
/** A plan doc is only trusted from text extensions. */
export const PLAN_DOC_EXTENSIONS = ['md', 'mdx', 'txt'] as const;
/** Scanning is linear but still bounded: never regex over more than this. */
export const MAX_SCAN_CHARS = 20_000;

// ---- documented vs fallback ----------------------------------------------
/** Minimum meaningful description length (after boilerplate is stripped). */
export const MIN_DOCUMENTED_CHARS = 80;

// ---- confidence -----------------------------------------------------------
export const UNDOCUMENTED_CONFIDENCE_CAP = 0.4;
export const PLAN_UNREADABLE_CONFIDENCE_CAP = 0.7;
export const LOW_CONFIDENCE_BELOW = 0.45;
export const MEDIUM_CONFIDENCE_BELOW = 0.75;

// ---- output caps ----------------------------------------------------------
export const MAX_INTENT_CHARS = 600;
export const MAX_SCOPE_ITEMS = 8;
export const MAX_SCOPE_ITEM_CHARS = 200;
export const MAX_RISK_AREAS = 5;
export const MAX_RISK_TITLE_CHARS = 120;
export const MAX_RISK_EXPLANATION_CHARS = 400;

// ---- timeouts -------------------------------------------------------------
export const ISSUE_FETCH_TIMEOUT_MS = 8_000;
export const PLAN_READ_TIMEOUT_MS = 8_000;
/** Whole-derivation budget for the manual regenerate endpoint. */
export const REGENERATE_TIMEOUT_MS = 30_000;
/** Whole-derivation budget when run inline before a review. */
export const RUN_INTENT_TIMEOUT_MS = 45_000;

/** Jira/Linear-style keys that are really something else (never tickets). */
export const NOT_TICKET_PREFIXES = new Set([
  'UTF', 'SHA', 'ISO', 'MD', 'AES', 'RSA', 'CVE', 'CWE', 'HTTP', 'TLS', 'SSL', 'RFC', 'GPT', 'ES', 'PR', 'X',
]);
