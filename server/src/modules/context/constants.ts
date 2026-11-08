/** Project Context Folder (SPEC-01) — module constants. Pure: no runtime imports. */

/** Per-run cap on attached project-context docs, in estimated tokens (AC-7 / AC-9). */
export const CONTEXT_TOKEN_CAP = 4000;
/** Token estimate = ceil(chars / CHARS_PER_TOKEN) (AC-1). */
export const CHARS_PER_TOKEN = 4;
/** Directory names never searched for docs (any depth). */
export const DOC_EXCLUDED_DIRS = ['node_modules', 'vendor', '.git', 'clones'] as const;
/** Upper bound on markdown files the walker returns. */
export const MAX_DOC_FILES = 2000;
export const MAX_DOC_PATH_CHARS = 1024;
export const MAX_ATTACHED_DOCS = 200;
/** Trace reason when the repo has no local clone at run time. */
export const PROJECT_CONTEXT_UNAVAILABLE = 'repo_not_synced' as const;

// ---------- DevDigest-owned docs (SPEC-03) ----------
export const DEVDIGEST_ROOT = '.devdigest/specs/';
export const DEVDIGEST_NAMESPACE = '.devdigest';
export const MAX_DEVDIGEST_DOC_BYTES = 1_048_576;
export const MAX_DEVDIGEST_DOCS = 200;
/** base64 of 1 MiB + envelope (skills precedent). */
export const DEVDIGEST_UPLOAD_BODY_LIMIT = 1_600_000;
/** JSON-escaped 1 MiB; the 1 MiB rule itself is enforced in the service. */
export const DEVDIGEST_SAVE_BODY_LIMIT = 3_145_728;
