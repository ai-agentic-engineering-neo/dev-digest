/**
 * Source-file scope shared by the code-analysis adapters (ast-grep, depgraph)
 * and the repo-intel module. Lives in the server-wide domain ring so adapters
 * never import a feature module (rule adapters-no-modules). Pure constants only.
 */

/** Files we parse and index. */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Declaration signatures are trimmed to this many chars (cache stability). */
export const MAX_SIGNATURE_CHARS = 120;
