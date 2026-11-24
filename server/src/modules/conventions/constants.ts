/** How many top-ranked files from repo-intel are sent to the model. */
export const TOP_N = 12;

/** Max candidates the model may return (also enforced by the zod schema). */
export const MAX_CANDIDATES = 15;

/** Per-file and total character budgets for the model input. */
export const MAX_FILE_CHARS = 8_000;
export const MAX_TOTAL_CHARS = 80_000;

/** Max lines of a quoted snippet we persist. */
export const MAX_SNIPPET_CHARS = 1_200;

/** Repo-level style configs sent ahead of the code samples (when present). */
export const CONFIG_FILES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'prettier.config.mjs',
  'prettier.config.cjs',
  '.editorconfig',
] as const;

export const EXTRACT_SCHEMA_NAME = 'ConventionExtraction';
export const EXTRACT_PROMPT = 'conventions.system.md';
