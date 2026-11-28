/** M2 Conventions Extractor: limits for sampling, the prompt and the result. */

/** Ranked source files sent to the model, from repo-intel's `getConventionSamples`. */
export const SAMPLE_FILE_COUNT = 12;

/** Config file names that state conventions directly (looked up at the repo root and in each sampled top-level package). */
export const CONFIG_FILE_NAMES = [
  'package.json',
  'tsconfig.json',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
] as const;

/** At most this many config files go into the prompt. */
export const MAX_CONFIG_FILES = 6;

/** A file longer than this is cut before it goes into the prompt. */
export const MAX_FILE_CHARS = 6_000;

/** Total characters of file content in one prompt. */
export const MAX_PROMPT_FILE_CHARS = 60_000;

/** The structured-output schema name (MockLLMProvider keys fixtures by it). */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/** Output cap for the one extraction call. */
export const EXTRACTION_MAX_TOKENS = 16_000;

/** Candidates kept from one run, highest confidence first. */
export const MAX_CANDIDATES = 12;

/** Low temperature: the same repo should give similar candidates. */
export const EXTRACTION_TEMPERATURE = 0.2;
