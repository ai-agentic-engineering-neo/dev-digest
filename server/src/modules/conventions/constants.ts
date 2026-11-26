/**
 * Conventions Extractor — tuning knobs (data only). Sampling is code-only and
 * deterministic: the model never chooses what it reads, so two scans of the
 * same commit see the same bytes and cost a predictable number of tokens.
 */

/** Rank-ordered source files in the sample (repo-intel picks them). */
export const TOP_CODE_SAMPLES = 12;

/**
 * Config files worth their tokens: they state conventions declaratively, so a
 * rule derived from one is checkable. Missing ones are skipped silently.
 */
export const CONFIG_SAMPLE_PATHS = [
  'package.json',
  'tsconfig.json',
  'eslint.config.mjs',
  'eslint.config.js',
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.prettierrc',
  '.prettierrc.json',
  '.editorconfig',
  'biome.json',
  'CONTRIBUTING.md',
  'AGENTS.md',
] as const;

/** Per-file cap on what reaches the prompt; beyond it a file is truncated. */
export const MAX_FILE_LINES = 220;
export const MAX_FILE_CHARS = 12_000;

/** Cap on the whole rendered sample, so a big repo cannot blow the context. */
export const MAX_SAMPLE_CHARS = 90_000;

/** How many rules we ask for. More is noise, not coverage. */
export const MAX_CANDIDATES = 12;

/** Evidence pieces kept per rule (shown on the card; first one goes in the skill). */
export const MAX_EVIDENCE_PER_RULE = 3;

/** Evidence gate — a snippet head shorter than this identifies nothing. */
export const MIN_SNIPPET_CHARS = 8;

/** Lines of real file content kept as one displayed evidence snippet. */
export const MAX_SNIPPET_LINES = 8;

/** Confidence below this is not returned to the user. */
export const MIN_CONFIDENCE = 0.5;

/** Extraction call bounds: one call; retries are the provider's own. */
export const EXTRACT_TEMPERATURE = 0.1;
export const EXTRACT_MAX_TOKENS = 6_000;
export const EXTRACT_TIMEOUT_MS = 120_000;

export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/** Default type of a skill made from conventions. */
export const CONVENTION_SKILL_TYPE = 'convention' as const;
export const EXTRACTED_SOURCE = 'extracted' as const;
