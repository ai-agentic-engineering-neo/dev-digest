/** conventions — pure values (ring 2). No imports, no I/O. */

/** JobRunner kind for a background extraction run. */
export const EXTRACT_JOB_KIND = 'conventions.extract';

/** Sample budget: top-N ranked source files (repo-intel) plus the config files below. */
export const SAMPLE_FILE_COUNT = 12;

/** Config files that carry house conventions; looked up at the repo root and in each sampled top-level folder. */
export const CONFIG_SAMPLE_FILES = [
  'eslint.config.mjs',
  'eslint.config.js',
  'eslint.config.cjs',
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.eslintrc.js',
  '.eslintrc',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'prettier.config.mjs',
  '.editorconfig',
  'biome.json',
] as const;

/** Per-file and total caps on sample text sent to the model. */
export const MAX_SAMPLE_CHARS = 6_000;
export const MAX_TOTAL_SAMPLE_CHARS = 60_000;

/** Candidates below this confidence are dropped before verification. */
export const MIN_CONFIDENCE = 0.3;

/** How many lines around the claimed evidence line the snippet may sit in. */
export const EVIDENCE_LINE_WINDOW = 2;

/**
 * A scan still `running` after this long was orphaned (crashed process, hung
 * provider); `extract()` marks it failed and starts a fresh one.
 */
export const STALE_SCAN_MS = 10 * 60_000;

/** The skill the accepted candidates become (HW2 §42); editable in the modal. */
export const DEFAULT_SKILL_NAME = 'repo-conventions';
