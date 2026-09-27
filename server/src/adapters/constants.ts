/**
 * Constants owned by the adapter layer: they describe what the external tools
 * (ast-grep, dependency-cruiser) can actually handle, not what a feature wants.
 *
 * They live here rather than in a module so adapters stay outer-ring — an
 * adapter importing from `modules/**` points the dependency the wrong way.
 * `modules/repo-intel/constants.ts` re-exports them for its own use.
 */

/** Files the parsers understand. */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Truncation cap for an extracted symbol signature. */
export const MAX_SIGNATURE_CHARS = 120;
