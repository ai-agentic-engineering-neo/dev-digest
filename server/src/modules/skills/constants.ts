/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Reject zip / `.skill` archives larger than this (compressed bytes). */
export const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;

/** Reject a `SKILL.md` (or uploaded markdown) larger than this. */
export const MAX_SKILL_MD_BYTES = 1024 * 1024;

/** Filename suffixes accepted by skill import. `.skill` is a zip. */
export const IMPORT_EXTENSIONS = ['.md', '.zip', '.skill'] as const;
