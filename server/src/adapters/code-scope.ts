/**
 * Source-code scope shared by the code-analysis adapters (astgrep, depgraph)
 * and the repo-intel indexer. Lives under adapters/ because adapters must not
 * import feature modules; modules/repo-intel/constants.ts re-exports these.
 */

/** Files we parse and graph. */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Signatures are trimmed to this many chars in the parse phase (cache stability). */
export const MAX_SIGNATURE_CHARS = 120;
