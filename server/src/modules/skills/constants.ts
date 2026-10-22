/** Constants for the skills module. */

/** Version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Type assigned to an imported skill until the user picks one in the preview. */
export const DEFAULT_IMPORT_TYPE = 'custom' as const;

/** The only archive entry whose text becomes the skill (Anthropic skill layout). */
export const SKILL_ENTRY_NAME = 'SKILL.md';

/** Upload limits for import preview — the archive is parsed in memory only. */
export const MAX_IMPORT_BYTES = 1_048_576;
export const MAX_SKILL_MD_BYTES = 262_144;
export const MAX_ARCHIVE_ENTRIES = 500;

/** Route body limit for the base64-encoded upload (≈ 4/3 of MAX_IMPORT_BYTES + JSON). */
export const IMPORT_BODY_LIMIT = 1_500_000;

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;
export const ARCHIVE_EXTENSIONS = ['.zip'] as const;
