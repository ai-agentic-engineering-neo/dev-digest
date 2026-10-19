/** L02 — conventions module literals. */

/** Top-ranked source files sampled per extraction (repoIntel.getConventionSamples). */
export const SAMPLE_FILES = 12;

/**
 * Tooling configs read from the clone root, by exact name — they state the
 * house rules the code is held to (lint, formatting, compiler strictness).
 */
export const CONFIG_FILES = [
  'package.json',
  'tsconfig.json',
  'tsconfig.base.json',
  'jsconfig.json',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'biome.json',
  '.editorconfig',
] as const;

/** Per-file cap so one huge file can't blow the token budget. */
export const MAX_FILE_LINES = 400;

/** A cited line may drift this many lines from where the quote really is. */
export const LINE_TOLERANCE = 3;

/** Snippet window cut around the verified line. */
export const SNIPPET_BEFORE = 2;
export const SNIPPET_AFTER = 3;

/** Shortest quote (after whitespace normalisation) accepted as evidence. */
export const MIN_QUOTE_CHARS = 4;

/** Candidates kept per extraction (highest confidence first). */
export const MAX_CANDIDATES = 20;

/** A `running` extraction older than this is treated as dead (crash / restart). */
export const EXTRACT_STALE_MS = 10 * 60_000;

export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';
