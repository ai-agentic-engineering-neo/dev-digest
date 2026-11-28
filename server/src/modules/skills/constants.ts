/** Constants for the skills module (M2). */

/** Version a newly created or imported skill starts at. */
export const INITIAL_SKILL_VERSION = 1;

/** Largest decoded upload accepted by the import preview (1 MB). */
export const IMPORT_MAX_UPLOAD_BYTES = 1024 * 1024;

/** Most entries a zip may list. */
export const IMPORT_MAX_ENTRIES = 200;

/** Largest `.md` entry, checked declared-before and actual-after inflating (256 KB). */
export const IMPORT_MAX_ENTRY_BYTES = 256 * 1024;

/**
 * Body limit of the preview route. base64 makes the JSON body about 4/3 of the
 * file, so a 1 MB upload does not fit the app's global 1 MB `bodyLimit`.
 */
export const IMPORT_PREVIEW_BODY_LIMIT = 1.5 * 1024 * 1024;

/** Longest skill name (kebab-case slug); mirrors the `SkillName` contract. */
export const SKILL_NAME_MAX = 64;

/** Name used when neither the frontmatter nor the file name yields a slug. */
export const FALLBACK_SKILL_NAME = 'imported-skill';
