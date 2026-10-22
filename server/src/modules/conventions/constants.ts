/** Constants for the conventions module. */

/** Config filenames read off the clone (when present) as extra context for the model. */
export const CONFIG_SAMPLE_PATTERNS: readonly string[] = [
  '.editorconfig',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  'eslint.config.js',
  'eslint.config.mjs',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.yml',
  'biome.json',
  'tsconfig.json',
];

/** How many source files `repoIntel.getConventionSamples` contributes. */
export const SOURCE_SAMPLE_COUNT = 12;

/** Per-file cap on content sent to the model (chars) — keeps the prompt bounded. */
export const MAX_FILE_CHARS = 12_000;

/** Upper bound on candidates the model may propose in one extraction call. */
export const MAX_CANDIDATES = 12;

/** Largest evidence snippet accepted from the model, in characters. */
export const MAX_SNIPPET_CHARS = 2000;

/** Schema name of the single structured extraction call (also the mock fixture key). */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';
