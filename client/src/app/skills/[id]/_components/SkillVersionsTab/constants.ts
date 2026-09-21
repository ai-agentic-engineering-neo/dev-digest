/** Constants for the version history tab. */

/**
 * Ceiling on the LCS table the line diff is allowed to build (cells = old lines
 * × new lines). A skill body is capped at 64k characters, so a pathological
 * pair could reach a few million cells; past this the diff degrades to
 * "everything removed, everything added", which is honest and instant rather
 * than accurate and janky.
 */
export const MAX_DIFF_CELLS = 1_000_000;
