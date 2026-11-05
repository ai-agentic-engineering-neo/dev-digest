/** Conventions Extractor tuning knobs. */

/** Top-ranked source files sampled via repoIntel.getConventionSamples(). */
export const SAMPLE_TOP_FILES = 12;

/** Per-file character cap for sampled source files (head of the file is kept). */
export const MAX_SOURCE_FILE_CHARS = 12_000;

/** Per-file character cap for config files (tsconfig, eslint, prettier…). */
export const MAX_CONFIG_FILE_CHARS = 4_000;

/** Total character budget for everything sent to the model. */
export const MAX_TOTAL_SAMPLE_CHARS = 90_000;

/** Upper bound on candidates the model may return. */
export const MAX_CANDIDATES = 15;

/**
 * Output cap for the extraction call. 15 candidates ≈ 2-3k tokens; without a cap
 * the adapter reserves the model maximum (65k), which a low OpenRouter credit
 * limit rejects with 402 before generating anything.
 */
export const EXTRACTION_MAX_TOKENS = 4_000;

/** Structured-output schema name (also the MockLLM fixture key in tests). */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/**
 * The extractor's own default model (a cheap one). Conventions keeps its own
 * dynamic default instead of the FEATURE_MODELS registry entry (see
 * modules/settings/feature-models.ts); a workspace override in Settings →
 * Feature Models wins. The client mirrors it in client/src/lib/feature-models.ts.
 */
export const DEFAULT_CONVENTIONS_MODEL = { provider: 'openai', model: 'gpt-4.1-mini' } as const;
