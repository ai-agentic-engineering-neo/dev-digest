/**
 * repo-intel constants. Phase-tagged: [T1] used now; [T2]/[T3]
 * exported early so the pipeline lands against a single source of truth.
 */

// --- Job kinds (registered on JobRunner; enqueued from repos/service.ts) ----
export const INDEX_JOB_KIND = 'repo-intel-index';
export const REFRESH_JOB_KIND = 'repo-intel-refresh';
/** Manual "re-analyze": fetch latest from origin + incremental reindex. */
export const RESYNC_JOB_KIND = 'repo-intel-resync';

// --- Walk / parse scope -----------------------------------------------------
/** [T1] Files we parse (diff-scoped in T1; whole walk in T2). */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** [T1] Directories never walked. `.gitignore` is layered on top in T2 walk. */
export const EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;

// --- Read-time limits -------------------------------------------------------
/** [T1] Caller fan-out cap per changed symbol (ORDER BY rank DESC LIMIT N). */
export const MAX_CALLERS_PER_SYMBOL = 20;

/**
 * [T1] Bumped whenever the AST extractor or symbol schema changes. A mismatch
 * with `repo_index_state.indexer_version` forces a full reindex.
 *
 * v2 (T3): graph + decl_file resolution + file_rank + repo-map landed, so every
 * T2 `partial` index must be rebuilt to gain the rank-driven data.
 */
export const INDEXER_VERSION = 3;
/** v3 (specs/18): module-aware graph — file_imports/file_exports/symbol_edges, binding-based decl_file. */

/** Reindex progress is flushed every N parsed files (AC-16). */
export const REINDEX_PROGRESS_EVERY = 100;

// --- [T2] Full-index limits (documented now, enforced in the pipeline) ------
export const MAX_INDEXED_FILES = 5000;
export const MAX_FILE_SIZE = 400 * 1024; // 400 KB
export const MAX_PARSE_MS_PER_FILE = 2000;
/** Soft self-watch budget (< JobRunner hard 120s) → finish as `partial`. */
export const INDEX_SOFT_BUDGET_MS = 110_000;

// --- Blast v2 (specs/18 caps; plan 19 "Caps (numbers)") ---------------------
export const BLAST_MAX_DEPTH = 6;
export const BLAST_DEFAULT_DEPTH = 6;
/** Nodes / edges kept in a PR impact graph (changed, then entry points, then impacted). */
export const MAX_BLAST_NODES = 300;
export const MAX_BLAST_EDGES = 600;
/** Internal traversal visited cap; beyond it counts are lower bounds (`totalsCapped`). */
export const MAX_TRAVERSAL_NODES = 5000;
export const MAX_BLAST_ENTRY_POINTS = 50;
export const MAX_BLAST_TESTS = 100;
/** `(to_path, to_name) IN (…)` chunk per hop query. */
export const BLAST_QUERY_CHUNK = 200;
/** Changed files parsed at head per blast read; the rest stay base-only. */
export const MAX_OVERLAY_FILES = 200;
export const OVERLAY_CONCURRENCY = 8;
export const MAX_DEGRADED_FILES_LISTED = 50;
/** `lowConfidence` iff the resolved share of value bindings is below this. */
export const LOW_CONFIDENCE_VALUE_SHARE = 0.8;

// --- [T3] Graph / hotness / repo-map ---------------------------------------
export const BFS_DEPTH = 2;
export const HOTNESS_WINDOW_DAYS = 180;
export const DEFAULT_REPO_MAP_TOKEN_BUDGET = 1500;
/** Signatures are trimmed to this many chars in the parse phase (cache stability). */
export const MAX_SIGNATURE_CHARS = 120;
