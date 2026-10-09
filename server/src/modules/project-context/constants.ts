/**
 * specs/09-project-context-folder.md — Project Context Folder constants.
 *
 * Q3 (delegated to planning, DECIDED in plans/09-project-context-folder.md):
 * an ABSOLUTE token budget, not a share of the model's context window — this
 * codebase has no per-model context-window table anywhere
 * (`platform/price-book.ts` carries prices only), so a share-based budget
 * would need a new lookup table and would silently differ per agent.
 */

/**
 * Absolute token budget for the whole assembled `## Project context` block.
 * ~32 KB of markdown, ~3-5 typical spec documents. For scale: the repo-map
 * slot budget is 1500 (`modules/repo-intel/constants.ts`).
 */
export const PROJECT_CONTEXT_TOKEN_BUDGET = 8000;

/**
 * Per-document size ceiling (AC-28). Between the skill-body cap (64 KB,
 * `modules/skills/constants.ts`) and the indexer's source-file cap (400 KB,
 * `modules/repo-intel/constants.ts`) — documents are bigger than skills,
 * smaller than generated source. Applied at discovery (excluded from the
 * listing entirely) and re-checked at read time (a file that grew past the
 * cap since it was listed is omitted from the run, not truncated).
 */
export const MAX_DOC_BYTES = 256 * 1024;

/**
 * Bounds the document listing and the per-document token-counting loop (the
 * page's performance requirement). Documents beyond the cap are excluded and
 * the count is reported in the discovery summary, mirroring `walkClone`'s
 * `stats.bounded` (`modules/repo-intel/pipeline/walk.ts`).
 */
export const MAX_DISCOVERED_DOCS = 500;

/** N5 — markdown documents only. */
export const DOC_EXTENSION = '.md';

/**
 * Q1/Q2 — default search roots (repository-relative DIRECTORY paths, not
 * globs — a directory prefix is trivially containable, unlike a glob) used
 * when a repo's `doc_roots` column is NULL. The union of both design sources
 * (`specs/`, `docs/`) plus the mockup's `.devdigest/specs/`, minus `insights`
 * (no such convention in this repo). Documented in `server/README.md`'s
 * config notes.
 */
export const DEFAULT_DOC_ROOTS: readonly string[] = ['specs', 'docs', '.devdigest/specs'];

/**
 * Q4 — doc-type label is the last path segment of the matched root,
 * lowercased (`specs` → `specs`, `.devdigest/specs` → `specs`, `docs` →
 * `docs`). No new type taxonomy: any label outside the client's known three
 * ('specs'/'docs'/'insights') just renders with the neutral default color —
 * that's a client concern, not something the server restricts.
 */
export function docTypeLabel(root: string): string {
  const segments = root.split('/').filter((s) => s.length > 0);
  return (segments[segments.length - 1] ?? root).toLowerCase();
}
