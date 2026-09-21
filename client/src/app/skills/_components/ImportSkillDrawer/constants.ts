/** Constants for ImportSkillDrawer. */

export const DRAWER_WIDTH = 720;

/** What the file picker offers. Archives are handled entirely in the browser. */
export const ACCEPTED_FILE_TYPES = ".md,.markdown,.mdx,.zip";

/**
 * Cap on an imported document, mirroring the server's MAX_SKILL_BODY_CHARS.
 * Checked client-side too so a 40 MB file fails instantly instead of after an
 * upload, and so a zip bomb's inflated member is rejected before it is decoded.
 */
export const MAX_IMPORT_BYTES = 64_000;

/** Cap on the archive itself, before anything is enumerated. */
export const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;

/** Filenames treated as "the skill document" when an archive has several. */
export const SKILL_DOC_BASENAMES = ["skill.md", "skill.mdx", "readme.md"];

/** How many skipped archive entries to list before collapsing to a count. */
export const MAX_SKIPPED_SHOWN = 12;
