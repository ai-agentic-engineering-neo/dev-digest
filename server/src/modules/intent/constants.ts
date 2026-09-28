/**
 * Intent module constants — collection caps, cache versioning, and the
 * cross-repo issue policy. Kept small and explicit so the derivation is
 * auditable: every number here is either a token/latency budget or a
 * deliberate privacy boundary, never a magic default.
 */

/** Bump when the derivation logic changes in a way that should invalidate
 * every stored cache hit (the hash folds this in). */
export const INTENT_DERIVATION_VERSION = 1;

/** The PR body is capped before ANY regex or model sees it. */
export const MAX_BODY_CHARS = 6000;

/** Below this word count (after stripping boilerplate) the body counts as
 * not substantive — confidence cannot reach `high`/`medium` from it alone. */
export const MIN_SUBSTANTIVE_BODY_WORDS = 8;

export const MAX_LINKED_DOCS = 3;
export const MAX_DOC_CHARS = 12_000;
export const MAX_LINKED_ISSUES = 3;
export const MAX_ISSUE_CHARS = 3000;

/**
 * With the user's own GitHub token, an `owner/repo#N` reference could point
 * at a private issue in a repo the user can see but the PR author's audience
 * cannot — fetching it would send that text to the LLM provider. One constant,
 * not a per-workspace setting, so the policy cannot be silently loosened.
 */
export const FETCH_CROSS_REPO_ISSUES = false;

export const MAX_COMMITS = 30;
export const MAX_COMMIT_SUBJECT_CHARS = 120;
export const MAX_FILES_LISTED = 60;
export const MAX_LABELS = 10;

export const MAX_UNRESOLVED_REFS = 10;
export const MAX_REF_CHARS = 200;

export const MAX_SCOPE_ITEMS = 8;
export const MAX_SCOPE_ITEM_CHARS = 200;
export const MAX_RISK_AREAS = 5;
export const MAX_INTENT_CHARS = 500;

/** Per-request model timeout, honoured by the OpenAI/Anthropic adapters. */
export const INTENT_MODEL_TIMEOUT_MS = 45_000;
/** Hard ceiling around the whole model call — OpenRouter ignores `timeoutMs`
 * and retries a slow generation itself, so this is the real backstop. */
export const INTENT_MODEL_DEADLINE_MS = 60_000;
export const INTENT_MAX_TOKENS = 1200;
/** Timeout for the one-shot `fetchPullHead` retry on a doc-read miss. */
export const GIT_FETCH_TIMEOUT_MS = 20_000;

/** Extensions a doc reference is allowed to resolve to — prose only. */
export const DOC_EXTENSIONS = ['md', 'mdx', 'markdown', 'txt', 'rst', 'adoc'] as const;

/**
 * Upper-case prefixes that look like a `PROJ-123` ticket key but are common
 * acronyms — excluded so e.g. "UTF-8" or "ES-2022" don't get treated as a
 * tracker reference.
 */
export const NOT_TICKET_PREFIXES = [
  'UTF',
  'SHA',
  'ISO',
  'RFC',
  'HTTP',
  'TLS',
  'SSL',
  'CVE',
  'AES',
  'RSA',
  'ES',
] as const;
