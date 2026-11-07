/** DEFAULT - pending Q3. Mirrored in client/src/lib/feature-models.ts. */
export const DEFAULT_INTENT_MODEL = { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' } as const;
export const INTENT_SCHEMA_NAME = 'PrIntentClassification'; // also the MockLLM fixture key
export const INTENT_PROMPT_VERSION = 1; // part of the fingerprint
export const INTENT_MAX_TOKENS = 800;
export const INTENT_TIMEOUT_MS = 30_000;
export const INTENT_MAX_RETRIES = 1;
export const INTENT_MAX_CHARS = 400;
export const SCOPE_MAX_ITEMS = 8;
export const SCOPE_ITEM_MAX_CHARS = 160;
export const INTENT_BLOCK_MAX_CHARS = 1_800;
export const SUBSTANTIVE_BODY_MIN_CHARS = 120;
export const BODY_PARSE_MAX_CHARS = 20_000;
export const MAX_TITLE_CHARS = 300;
export const MAX_BODY_CHARS = 4_000;
export const MAX_ISSUES_FETCHED = 3;
export const MAX_ISSUE_CHARS = 3_000;
export const MAX_DOCS_READ = 3;
export const MAX_DOC_CHARS = 6_000;
export const MAX_COMMITS = 30;
export const MAX_COMMIT_CHARS = 200;
export const MAX_BRANCH_CHARS = 200;
export const MAX_PATHS = 150;
export const MAX_EXTERNAL_LINKS = 5;
export const MAX_TRACKER_KEYS = 5;
export const INTENT_INPUT_MAX_CHARS = 24_000;
export const REFRESH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
/** How long a failed derivation is remembered per (head_sha, input_hash). Decision OQ1. */
export const INTENT_NEGATIVE_CACHE_TTL_MS = 60_000;
/** PUT /pulls/:id/intent (cheap DB write, no model call). Decision OQ4. */
export const OVERRIDE_RATE_LIMIT = { max: 20, timeWindow: '1 minute' } as const;
