/**
 * L03 — Intent layer constants (ring ②: literals only, no I/O).
 *
 * Every cap here exists to keep the classifier prompt small, deterministic
 * and cheap — see `../../specs/L03-intent-layer.md` § Data sources.
 */
import type { IntentSourceKind } from '@devdigest/shared';

/** Bumped whenever the classifier prompt/system message changes meaning, so a
    stored `input_hash` from an old prompt version is treated as stale. */
export const INTENT_PROMPT_VERSION = 1;

export const INTENT_SCHEMA_NAME = 'PrIntentClassification';

// ---- Per-source caps -------------------------------------------------------
export const MAX_BODY_CHARS = 6000;
export const MAX_COMMITS = 30;
export const MAX_COMMIT_SUBJECT_CHARS = 120;
export const MAX_CHANGED_PATHS = 80;
export const MAX_LINKED_ISSUES = 3;
export const MAX_ISSUE_BODY_CHARS = 4000;
/** Linked + in-diff spec files together, linked ones counted first. */
export const MAX_SPEC_FILES = 3;
export const MAX_SPEC_CHARS = 8000;
export const MAX_EXTERNAL_LINKS = 5;

/** Sum of every source's (possibly truncated) length, across all kinds. */
export const MAX_TOTAL_SOURCE_CHARS = 30_000;

// ---- Substantive-body heuristic (see `isSubstantiveBody` in helpers.ts) ---
export const MIN_BODY_CHARS = 60;
export const MIN_BODY_WORDS = 8;

// ---- Link resolution -------------------------------------------------------
/** Hosts recorded as `external_link` / `unresolved` — never fetched (no
    outbound request to a URL the PR author controls; root INSIGHTS ssrf note). */
export const TRACKER_HOSTS = [
  'atlassian.net',
  'linear.app',
  'notion.so',
  'notion.site',
  'youtrack.cloud',
  'app.clickup.com',
  'app.shortcut.com',
  'app.asana.com',
  'gitlab.com',
  'trello.com',
] as const;

/** Extensions accepted for a spec/plan link or an in-diff spec file. */
export const SPEC_EXTENSIONS = ['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc'] as const;

/** A changed file counts as `spec_in_diff` when its path matches one of these
    (case-insensitive) AND its extension is in SPEC_EXTENSIONS. */
export const SPEC_PATH_PATTERNS: RegExp[] = [/(^|\/)specs\//i, /(^|\/)docs\//i, /(^|\/)plans\//i];

// ---- Classification (structured LLM call) ----------------------------------
export const CLASSIFY_TEMPERATURE = 0.1;
export const CLASSIFY_MAX_TOKENS = 800;

/** On-demand derive (routes.ts): the caller is staring at a spinner, so it
    gets one retry and a generous per-attempt timeout. Worst case 120s. */
export const ON_DEMAND_TIMEOUT_MS = 60_000;
export const ON_DEMAND_MAX_RETRIES = 1;

/** Review pre-work derive (run-executor.ts): no retry — a slow/failed derive
    must not meaningfully delay the review it's a courtesy to. The executor
    wraps the whole call in `INTENT_REVIEW_BUDGET_MS` on top (reviews/constants.ts). */
export const REVIEW_TIMEOUT_MS = 30_000;
export const REVIEW_MAX_RETRIES = 0;

// ---- Classifier output normalization ---------------------------------------
export const MAX_SCOPE_ITEMS = 6;
export const MAX_SCOPE_ITEM_CHARS = 120;
export const MAX_INTENT_CHARS = 300;

// ---- Prompt logging (L03) ---------------------------------------------------
/** Source kinds whose `ref` (a spec path or `#N`) is safe to log even in
    verbose mode. `title` and `branch` are deliberately excluded — their refs
    ARE the PR author's own text (the title, the branch name), not a derived
    pointer, so they never appear in a log line (see decision 1). */
export const LOGGABLE_REF_KINDS: IntentSourceKind[] = [
  'linked_spec',
  'spec_in_diff',
  'linked_issue',
  'description',
  'commits',
  'changed_paths',
];
