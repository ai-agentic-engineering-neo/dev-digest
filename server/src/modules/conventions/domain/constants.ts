/** Conventions extractor limits (server/specs/04-conventions.md, Pipeline). */

/** Top-ranked source files taken from repo-intel (or from the fallback walk). */
export const SAMPLE_TOP_N = 12;
/** Config / rule docs sent at most. */
export const CONFIG_MAX_FILES = 8;
/** Per-file cap for a source file / a config file sent to the model. */
export const SOURCE_FILE_MAX_CHARS = 6_000;
export const CONFIG_FILE_MAX_CHARS = 3_000;
/** Total sample budget (~22k tokens) — keeps the call cheap. */
export const SAMPLE_TOTAL_MAX_CHARS = 90_000;
/** Files larger than this are never read (minified bundles, lockfiles, data). */
export const FILE_READ_MAX_BYTES = 512 * 1024;

/** Candidates the model may propose, and the text caps applied on parse. */
export const MAX_CANDIDATES = 15;
export const RULE_MAX_CHARS = 500;
/** Real file lines stored as the snippet of one evidence item. */
export const EVIDENCE_MAX_LINES = 12;

/** A `running` scan older than this is treated as dead (crash / restart). */
export const SCAN_STALE_MS = 10 * 60_000;
/** Upper bound for the model call. */
export const LLM_TIMEOUT_MS = 100_000;
export const LLM_MAX_OUTPUT_TOKENS = 6_000;

/** Job kind on the JobRunner. */
export const EXTRACT_JOB_KIND = 'conventions.extract';

/**
 * Config files and rule docs sampled from the clone root and depth 1 (e.g. `server/`).
 * Matched on the base name; `tsconfig*.json`, `.eslintrc*`, `eslint.config.*` and
 * `prettier.config.*` / `.prettierrc*` are matched by prefix in `isConfigFile`.
 */
export const CONFIG_BASENAMES = [
  'package.json',
  'biome.json',
  'biome.jsonc',
  '.editorconfig',
  'pyproject.toml',
  'ruff.toml',
  'setup.cfg',
  '.golangci.yml',
  '.golangci.yaml',
  'rustfmt.toml',
  '.rubocop.yml',
  'CONTRIBUTING.md',
  'AGENTS.md',
  'CLAUDE.md',
  'STYLEGUIDE.md',
] as const;
export const CONFIG_PREFIXES = ['tsconfig', '.eslintrc', 'eslint.config.', '.prettierrc', 'prettier.config.'] as const;

/** Source extensions the fallback walk samples. */
export const SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.rb',
  '.php',
  '.cs',
  '.swift',
] as const;

/** Directories never walked (dependencies, build output, fixtures). */
export const SKIP_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  '.next',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  'migrations',
  'fixtures',
  '__snapshots__',
] as const;

/** Bounds of the fallback walk. */
export const WALK_MAX_FILES = 5_000;
export const WALK_MAX_DEPTH = 8;
