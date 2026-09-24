/** Intent layer limits (server/specs/05-intent-layer.md, "Data sources"). */

export const TITLE_MAX_CHARS = 300;
export const BODY_MAX_CHARS = 6_000;

export const TICKET_MAX = 3;
export const TICKET_MAX_CHARS = 3_000;

export const DOC_MAX = 5;
/** A doc is never fetched past this size, whether via git or the Contents API. */
export const DOC_FETCH_MAX_BYTES = 64 * 1024;
export const DOC_MAX_CHARS = 8_000;
export const DOC_TOTAL_MAX_CHARS = 20_000;
/** Extensions a doc source may be read from — server/specs/05-intent-layer.md. */
export const DOC_EXTENSIONS = ['.md', '.mdx', '.markdown', '.txt'] as const;

export const COMMITS_MAX = 30;
export const COMMIT_MAX_CHARS = 200;
export const BRANCH_MAX_CHARS = 120;
export const CHANGED_FILES_MAX = 100;
/** Only used when derived_from ends up 'inferred' (no substantive body/ticket/doc). */
export const DIFF_EXCERPT_MAX_CHARS = 6_000;

/** Body length (after stripping HTML comments/template headings) counted as "explicit". */
export const SUBSTANTIVE_BODY_MIN_CHARS = 40;

/** Clamp on the model's own output — defense in depth, matches conventions' RULE_MAX_CHARS pattern. */
export const INTENT_TEXT_MAX_CHARS = 500;
export const SCOPE_MAX_ITEMS = 10;
export const SCOPE_ITEM_MAX_CHARS = 240;

/** Wall-clock budget for one derivation (server/specs/05-intent-layer.md). */
export const INTENT_BUDGET_MS = 30_000;
export const LLM_MAX_OUTPUT_TOKENS = 800;
export const LLM_MAX_RETRIES = 1;

/** Bumping this forces every cached row to miss on the next review (cache key input). */
export const PROMPT_VERSION = 2; // v2: output language pinned to English

/** Structured-output schema name (also the mock LLM's fixture key). */
export const INTENT_CLASSIFICATION_SCHEMA_NAME = 'IntentClassification';

/** POST /pulls/:id/intent/refresh rate limit. */
export const REFRESH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

/**
 * Uppercase prefixes of `JIRA_KEY_RE` matches that are standards/protocol
 * names, not ticket keys (verified false positives: UTF-8, SHA-256). An
 * Atlassian key sharing one of these as a real project prefix is out of
 * scope for this slice — see server/specs/05-intent-layer.md.
 */
export const NON_TICKET_KEY_PREFIXES = [
  'UTF',
  'SHA',
  'ISO',
  'RFC',
  'CVE',
  'HTTP',
  'HTTPS',
  'TLS',
  'SSL',
  'AES',
  'RSA',
  'GPT',
  'ES',
  'ECMA',
  'IPV',
  'X',
] as const;
