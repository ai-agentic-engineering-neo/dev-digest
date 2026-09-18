/** Closed list of style-config basenames tried at the clone root (no model pick). */
export const CONFIG_BASENAMES = [
  'tsconfig.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.prettierrc',
  '.prettierrc.json',
] as const;

/** Rank-sample size passed to `repoIntel.getConventionSamples`. */
export const CONVENTION_SAMPLE_N = 12;

/** `completeStructured` schemaName — MockLLM looks this up in `structuredBySchema`. */
export const CONVENTION_EXTRACTION_SCHEMA = 'ConventionExtraction';
