/** Constants for the conventions module (extracted magic values). */

/** Config filenames sampled off the clone, first hit per pattern wins. */
export const CONFIG_SAMPLE_PATTERNS: string[] = [
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.yml',
  'tsconfig.json',
];

/** How many top-ranked source files `repoIntel.getConventionSamples` contributes. */
export const SOURCE_SAMPLE_COUNT = 12;

/** Upper bound on candidates the model may propose in one extraction call. */
export const MAX_CANDIDATES = 12;

/** Largest evidence snippet accepted from the model, in characters. */
export const MAX_SNIPPET_CHARS = 2000;
